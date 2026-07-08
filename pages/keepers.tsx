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
import { useLeagueKeepers } from "../lib/leagueState";
import {
  assignKeeperSlots,
  MAX_KEEPERS_PER_TEAM,
  missingByRosterFromDeltas,
} from "../lib/keepers";
import { cn } from "../lib/cn";

type Scope = "mine" | "all";

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
    data: allLeagueKeepers,
    save: persistKeepers,
    clear: clearPersistedKeepers,
    isShared,
  } = useLeagueKeepers(league?.league_id);

  const myRosterId = useMemo<number | undefined>(() => {
    if (!data) return undefined;
    return findMyRosterId(data.currentUsers, data.currentRosters, username);
  }, [data, username]);

  const [scope, setScope] = useState<Scope>("mine");
  const [selectedPos, setSelectedPos] = useState<string | "all">("all");
  const [showDraftDetails, setShowDraftDetails] = useState(false);
  const [selectedKeepers, setSelectedKeepers] = useState<Set<string>>(new Set());
  const [savedKeepers, setSavedKeepers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!data) return;
    if (isShared && myRosterId != null) {
      const mine = allLeagueKeepers.find((r) => r.rosterId === myRosterId);
      const ids = new Set(mine?.playerIds ?? []);
      setSavedKeepers(ids);
      setSelectedKeepers(ids);
    } else {
      const local = allLeagueKeepers[0];
      const ids = new Set(local?.playerIds ?? []);
      setSavedKeepers(ids);
      setSelectedKeepers(ids);
    }
  }, [data, allLeagueKeepers, isShared, myRosterId]);

  const positions = useMemo(
    () => Array.from(new Set(data?.rows.map((r) => r.position) ?? [])).sort(),
    [data?.rows],
  );

  // "My team" only means something once the username matches a roster; fall
  // back to the full pool otherwise.
  const effectiveScope: Scope = myRosterId == null ? "all" : scope;

  const filteredByTeam = useMemo(() => {
    if (!data) return [];
    return effectiveScope === "mine"
      ? data.rows.filter((p) => p.rosterId === myRosterId)
      : data.rows;
  }, [data, effectiveScope, myRosterId]);

  const filteredPlayers = useMemo(
    () =>
      selectedPos === "all"
        ? filteredByTeam
        : filteredByTeam.filter((p) => p.position === selectedPos),
    [filteredByTeam, selectedPos],
  );

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

  const computeSlotsForSave = (): Record<string, number> => {
    if (!data) return {};
    const candidates = data.rows
      .filter((p) => selectedKeepers.has(p.playerId) && p.keeperRound != null)
      .map((p) => ({
        playerId: p.playerId,
        rosterId: p.rosterId,
        cost: p.keeperRound!,
      }));
    const { slots } = assignKeeperSlots(candidates, missingByRoster);
    return Object.fromEntries(slots);
  };

  // ----- Build panel tabs for this page -----
  const savedKeepersForPanel = useMemo(() => {
    if (!data) return [];
    const rosters = data.currentRosters;
    const userByOwner = new Map(data.currentUsers.map((u) => [u.user_id, u]));
    return allLeagueKeepers.flatMap((entry) => {
      const roster = rosters.find((r) => r.roster_id === entry.rosterId);
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
  }, [data, allLeagueKeepers]);

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
      ...(savedKeepersForPanel.length > 0
        ? [
            {
              id: "keepers",
              label: "Keepers",
              count: savedKeepersForPanel.length,
              body: <KeepersListPanel players={savedKeepersForPanel} />,
            },
          ]
        : []),
    ];
  }, [data, savedKeepersForPanel]);

  usePanelTabs(panelTabs);

  const loading = leagueLoading || dataLoading;
  const error = leagueError ?? dataError;
  const dirty = !areSetsEqual(selectedKeepers, savedKeepers);
  const canSave = !!league && (!isShared || myRosterId != null);

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
          Pick up to {MAX_KEEPERS_PER_TEAM} keepers.{" "}
          {isShared
            ? "Shared league mode — your selections are visible to everyone."
            : "Local mode — selections saved to this device only."}
          {season && (
            <>
              {" · "}
              <span className="text-ink-400">Season {season}</span>
            </>
          )}
        </p>
      </div>

      {/* Scope + position filters */}
      {data && (
        <div className="space-y-2.5">
          {myRosterId != null && (
            <div className="inline-flex rounded-xl border border-ink-200 bg-white p-1 shadow-sm">
              {(
                [
                  { key: "mine", label: "My team" },
                  { key: "all", label: "All players" },
                ] as { key: Scope; label: string }[]
              ).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setScope(s.key)}
                  aria-pressed={effectiveScope === s.key}
                  className={cn(
                    "min-h-10 rounded-lg px-4 text-sm font-medium transition-colors",
                    effectiveScope === s.key
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-ink-600 hover:text-ink-900",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

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

      {data && filteredPlayers.length > 0 && (
        <>
          <PlayerTable
            players={filteredPlayers}
            selected={selectedKeepers}
            onSelectionChange={(set) => setSelectedKeepers(new Set(set))}
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

          {/* Spacer so the floating Save/Clear bar can't hide the last card
              at full scroll on mobile. */}
          {(dirty || selectedKeepers.size > 0) && (
            <div aria-hidden className="h-14 md:hidden" />
          )}

          <div className="fixed right-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50 flex gap-2 md:right-5 md:bottom-5">
            {dirty && (
              <Button
                variant="success"
                disabled={!canSave}
                onClick={async () => {
                  if (!league) return;
                  const slots = computeSlotsForSave();
                  const ids = Array.from(selectedKeepers);
                  const rosterId = isShared ? myRosterId : -1;
                  if (rosterId == null) return;
                  await persistKeepers({
                    rosterId,
                    playerIds: ids,
                    slotOverrides: slots,
                    updatedBy: username,
                  });
                  setSavedKeepers(new Set(selectedKeepers));
                }}
              >
                Save Keepers
              </Button>
            )}
            {selectedKeepers.size > 0 && (
              <Button
                variant="danger"
                disabled={!canSave}
                onClick={async () => {
                  if (!league) return;
                  const rosterId = isShared ? myRosterId : -1;
                  if (rosterId == null) return;
                  await clearPersistedKeepers(rosterId);
                  setSelectedKeepers(new Set());
                  setSavedKeepers(new Set());
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function areSetsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
