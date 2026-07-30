import { useEffect, useMemo, useState } from "react";
import PlayerTable from "../components/PlayerTable";
import { CountdownBanner } from "../components/CountdownBanner";
import { usePanelTabs } from "../components/LeaguePanel";
import { KeeperRulesPanel } from "../components/panels/KeeperRulesPanel";
import { DraftDeltaPanel } from "../components/panels/DraftDeltaPanel";
import { KeepersListPanel } from "../components/panels/KeepersListPanel";
import { Skeleton, SkeletonTable } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { Card, CardBody } from "../components/ui/Card";
import {
  findMyRosterId,
  useCurrentLeague,
  useKeeperHelperData,
} from "../lib/leagueHooks";
import { useIdentity } from "../lib/identity";
import { useKeeperScenarios, type RosterKeepers } from "../lib/leagueState";
import {
  assignKeeperSlots,
  MAX_KEEPERS_PER_TEAM,
  missingByRosterFromDeltas,
} from "../lib/keepers";
import { cn } from "../lib/cn";

/** "all" = every rostered player + ranked free agents; a number = one roster. */
type TeamFilter = "all" | number;

function scenarioMapFromEntries(entries: RosterKeepers[]): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  entries.forEach((e) => {
    if (e.rosterId < 0) return;
    out.set(e.rosterId, new Set(e.playerIds));
  });
  return out;
}

export default function KeepersPage() {
  const { username } = useIdentity();
  const {
    league,
    season,
    apiSeason,
    isFallbackSeason,
    isLoading: leagueLoading,
    error: leagueError,
  } = useCurrentLeague();
  const {
    data,
    isLoading: dataLoading,
    error: dataError,
  } = useKeeperHelperData(league, season);

  const {
    data: savedScenarios,
    saveScenarios,
    clearRoster,
    clearAll,
  } = useKeeperScenarios(league?.league_id);

  const myRosterId = useMemo<number | undefined>(() => {
    if (!data) return undefined;
    return findMyRosterId(data.currentUsers, data.currentRosters, username);
  }, [data, username]);

  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [selectedPos, setSelectedPos] = useState<string | "all">("all");
  const [showDraftDetails, setShowDraftDetails] = useState(false);
  const [scenario, setScenario] = useState<Map<number, Set<string>>>(new Map());
  const [savedScenario, setSavedScenario] = useState<Map<number, Set<string>>>(
    new Map(),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const map = scenarioMapFromEntries(savedScenarios);
    setScenario(map);
    setSavedScenario(map);
  }, [data, savedScenarios]);

  const positions = useMemo(
    () => Array.from(new Set(data?.rows.map((r) => r.position) ?? [])).sort(),
    [data?.rows],
  );

  const teamOptions = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.teams].sort((a, b) =>
      a.teamName.localeCompare(b.teamName),
    );
    return [
      ...sorted.filter((t) => t.rosterId === myRosterId),
      ...sorted.filter((t) => t.rosterId !== myRosterId),
    ];
  }, [data, myRosterId]);

  const filteredByTeam = useMemo(() => {
    if (!data) return [];
    return teamFilter === "all"
      ? data.rows
      : data.rows.filter((p) => p.rosterId === teamFilter);
  }, [data, teamFilter]);

  const filteredPlayers = useMemo(
    () =>
      selectedPos === "all"
        ? filteredByTeam
        : filteredByTeam.filter((p) => p.position === selectedPos),
    [filteredByTeam, selectedPos],
  );

  const selectedKeepers = useMemo(() => {
    const out = new Set<string>();
    filteredPlayers.forEach((p) => {
      if (p.rosterId < 0) return;
      if (scenario.get(p.rosterId)?.has(p.playerId)) out.add(p.playerId);
    });
    return out;
  }, [filteredPlayers, scenario]);

  const missingByRoster = useMemo(
    () => (data ? missingByRosterFromDeltas(data.deltas) : new Map()),
    [data],
  );

  const missingForTable = useMemo<Record<number, number[]>>(() => {
    const out: Record<number, number[]> = {};
    if (!data) return out;
    data.deltas.forEach((d, rid) => {
      out[rid] = d.missing;
    });
    return out;
  }, [data]);

  const buildScenarioEntries = (): RosterKeepers[] => {
    if (!data) return [];
    const rosterIds = new Set<number>();
    scenario.forEach((_, rid) => rosterIds.add(rid));

    return Array.from(rosterIds).map((rosterId) => {
      const playerIds = Array.from(scenario.get(rosterId) ?? []);
      const candidates = data.rows
        .filter((p) => playerIds.includes(p.playerId) && p.keeperRound != null)
        .map((p) => ({
          playerId: p.playerId,
          rosterId: p.rosterId,
          cost: p.keeperRound!,
        }));
      const { slots } = assignKeeperSlots(candidates, missingByRoster);
      return {
        rosterId,
        playerIds,
        slotOverrides: Object.fromEntries(slots),
      };
    });
  };

  const scenarioKeepersForPanel = useMemo(() => {
    if (!data) return [];
    const userByOwner = new Map(data.currentUsers.map((u) => [u.user_id, u]));
    return savedScenarios.flatMap((entry) => {
      if (entry.rosterId < 0 || entry.playerIds.length === 0) return [];
      const roster = data.currentRosters.find((r) => r.roster_id === entry.rosterId);
      const teamName =
        userByOwner.get(roster?.owner_id ?? "")?.metadata?.team_name ||
        userByOwner.get(roster?.owner_id ?? "")?.display_name ||
        `Team ${entry.rosterId}`;
      return entry.playerIds.map((pid) => {
        const player = data.rows.find((r) => r.playerId === pid);
        return {
          playerId: pid,
          name: player?.name ?? pid,
          position: player?.position ?? "?",
          roster: teamName,
        };
      });
    });
  }, [data, savedScenarios]);

  const panelTabs = useMemo(() => {
    if (!data) return [];
    return [
      {
        id: "rules",
        label: "Rules",
        body: <KeeperRulesPanel />,
      },
      {
        id: "deltas",
        label: "Pick Deltas",
        count: Array.from(data.deltas.values()).filter(
          (d) => d.extra.length + d.missing.length > 0,
        ).length,
        body: <DraftDeltaPanel teams={data.teams} deltas={data.deltas} />,
      },
      ...(scenarioKeepersForPanel.length > 0
        ? [
            {
              id: "keepers",
              label: "Scenario",
              count: scenarioKeepersForPanel.length,
              body: <KeepersListPanel players={scenarioKeepersForPanel} />,
            },
          ]
        : []),
    ];
  }, [data, scenarioKeepersForPanel]);

  usePanelTabs(panelTabs);

  const loading = leagueLoading || dataLoading;
  const error = leagueError ?? dataError;
  const dirty = !areScenarioMapsEqual(scenario, savedScenario);
  const totalScenarioCount = useMemo(() => {
    let n = 0;
    scenario.forEach((set) => {
      n += set.size;
    });
    return n;
  }, [scenario]);

  const handleSelectionChange = (newSel: Set<string>) => {
    setScenario((prev) => {
      const next = new Map(prev);
      filteredPlayers.forEach((p) => {
        if (p.rosterId < 0) return;
        const rosterSet = new Set(next.get(p.rosterId) ?? []);
        if (newSel.has(p.playerId)) rosterSet.add(p.playerId);
        else rosterSet.delete(p.playerId);
        if (rosterSet.size === 0) next.delete(p.rosterId);
        else next.set(p.rosterId, rosterSet);
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!league) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveScenarios(buildScenarioEntries());
      setSavedScenario(new Map(scenario));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save scenario.");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!league) return;
    if (teamFilter === "all") {
      await clearAll();
      setScenario(new Map());
      setSavedScenario(new Map());
      return;
    }
    await clearRoster(teamFilter);
    setScenario((prev) => {
      const next = new Map(prev);
      next.delete(teamFilter);
      return next;
    });
    setSavedScenario((prev) => {
      const next = new Map(prev);
      next.delete(teamFilter);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <CountdownBanner />

      {isFallbackSeason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Sleeper says it&apos;s the <strong>{apiSeason}</strong> season, but you don&apos;t have a{" "}
          {apiSeason} league yet. Showing <strong>{season}</strong> data so you can plan ahead.
        </div>
      )}

      {!leagueLoading && !league && (
        <Card>
          <CardBody className="text-sm text-ink-700">
            No Sleeper leagues found for <strong>{username}</strong>. Open the
            menu and use <em>Switch user</em> if you go by a different Sleeper
            username.
          </CardBody>
        </Card>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Keepers</h1>
        <p className="text-sm text-ink-500">
          Draft scenario planner — model keepers for any team to preview the
          board. Saved on this device only; official Sleeper keepers stay hidden
          until everyone declares.
          {season && (
            <>
              {" · "}
              <span className="text-ink-400">Season {season}</span>
            </>
          )}
        </p>
      </div>

      {data && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-600">
              Team
              <select
                value={String(teamFilter)}
                onChange={(e) =>
                  setTeamFilter(
                    e.target.value === "all" ? "all" : Number(e.target.value),
                  )
                }
                className="min-h-10 rounded-md border border-ink-300 bg-white px-2 py-1.5 text-base text-ink-900 shadow-sm"
              >
                <option value="all">All players</option>
                {teamOptions.map((t) => (
                  <option key={t.rosterId} value={t.rosterId}>
                    {t.teamName}
                    {t.rosterId === myRosterId ? " (my team)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {myRosterId != null && teamFilter !== myRosterId && (
              <button
                type="button"
                onClick={() => setTeamFilter(myRosterId)}
                className="min-h-10 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 shadow-sm hover:bg-ink-50"
              >
                My team
              </button>
            )}
          </div>

          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
            {["all", ...positions].map((pos) => {
              const active = selectedPos === pos;
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setSelectedPos(pos)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-full border px-3.5 text-sm transition-colors",
                    active
                      ? "border-brand-300 bg-brand-50 font-medium text-brand-900"
                      : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50",
                  )}
                >
                  {pos === "all" ? "All" : pos}
                </button>
              );
            })}
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              checked={showDraftDetails}
              onChange={(e) => setShowDraftDetails(e.target.checked)}
              className="h-4.5 w-4.5 accent-brand-600"
            />
            Show previous draft details
          </label>
        </div>
      )}

      {loading && (
        <div className="rounded-xl border border-ink-200 bg-white p-2 shadow-sm">
          <Skeleton className="mb-2 h-8 w-1/3" />
          <SkeletonTable rows={12} cols={10} />
        </div>
      )}
      {error && (
        <Card>
          <CardBody>
            <div className="text-sm text-red-700">{error.message}</div>
          </CardBody>
        </Card>
      )}

      {data && filteredPlayers.length === 0 && (
        <Card>
          <CardBody className="text-sm text-ink-600">
            No players match this filter.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setTeamFilter("all");
                setSelectedPos("all");
              }}
            >
              Reset filters
            </button>
          </CardBody>
        </Card>
      )}

      {data && filteredPlayers.length > 0 && (
        <>
          <PlayerTable
            players={filteredPlayers}
            selected={selectedKeepers}
            onSelectionChange={handleSelectionChange}
            missing={missingForTable}
            showDraftDetails={showDraftDetails}
            maxKeepers={MAX_KEEPERS_PER_TEAM}
          />

          <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-ink-500">
            <span>
              PPR rankings:{" "}
              <a className="underline" href="https://fantasycalc.com" target="_blank" rel="noreferrer">
                FantasyCalc
              </a>
            </span>
            <span>·</span>
            <span>
              Value algorithm by{" "}
              <a className="underline" href="https://twitter.com/rexmacmillan" target="_blank" rel="noreferrer">
                Rex MacMillan
              </a>
            </span>
          </div>

          {(dirty || totalScenarioCount > 0) && (
            <div aria-hidden className="h-14 md:hidden" />
          )}

          <div className="fixed right-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50 flex gap-2 md:right-5 md:bottom-5">
            {dirty && (
              <Button variant="success" disabled={saving || !league} onClick={handleSave}>
                Save scenario
              </Button>
            )}
            {totalScenarioCount > 0 && (
              <Button variant="danger" disabled={!league} onClick={handleClear}>
                {teamFilter === "all" ? "Clear all" : "Clear team"}
              </Button>
            )}
          </div>

          {saveError && (
            <p className="text-sm text-red-700">{saveError}</p>
          )}
        </>
      )}
    </div>
  );
}

function areScenarioMapsEqual(
  a: Map<number, Set<string>>,
  b: Map<number, Set<string>>,
) {
  if (a.size !== b.size) return false;
  for (const [rid, setA] of a) {
    const setB = b.get(rid);
    if (!setB || setA.size !== setB.size) return false;
    for (const id of setA) if (!setB.has(id)) return false;
  }
  return true;
}
