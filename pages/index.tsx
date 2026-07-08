import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PlayerTable from "../components/PlayerTable";
import { CountdownBanner } from "../components/CountdownBanner";
import { usePanelTabs } from "../components/LeaguePanel";
import { KeeperRulesPanel } from "../components/panels/KeeperRulesPanel";
import { DraftDeltaPanel } from "../components/panels/DraftDeltaPanel";
import { KeepersListPanel } from "../components/panels/KeepersListPanel";
import { Skeleton, SkeletonTable } from "../components/ui/Skeleton";
import { Button } from "../components/ui/Button";
import { Avatar } from "../components/ui/Avatar";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { useCurrentLeague, useKeeperHelperData } from "../lib/leagueHooks";
import { useIdentity } from "../lib/identity";
import { useLeagueKeepers } from "../lib/leagueState";
import { assignKeeperSlots, missingByRosterFromDeltas } from "../lib/keepers";
import { cn } from "../lib/cn";

const MAX_KEEPERS_PER_TEAM = 4;

export default function HomePage() {
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
    if (!data || !username) return undefined;
    const owner = data.currentUsers.find(
      (u) =>
        u.display_name?.toLowerCase() === username.toLowerCase() ||
        u.metadata?.team_name?.toLowerCase() === username.toLowerCase(),
    );
    if (!owner) return undefined;
    return data.currentRosters.find((r) => r.owner_id === owner.user_id)?.roster_id;
  }, [data, username]);

  const [selectedRoster, setSelectedRoster] = useState<number | "all">("all");
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

  const filteredByTeam = useMemo(() => {
    if (!data) return [];
    return selectedRoster === "all"
      ? data.rows
      : data.rows.filter((p) => p.rosterId === selectedRoster);
  }, [data, selectedRoster]);

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
            No Sleeper leagues found for <strong>{username}</strong>. If you have a different
            Sleeper username, click <em>switch</em> in the top right to change it.
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {league?.name ? `${league.name}` : "Keeper Helper"}
          </h1>
          <p className="text-sm text-ink-500">
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
        <div className="flex flex-wrap gap-2">
          <Link
            href="/advisor"
            className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
          >
            ✨ Keeper Advisor
          </Link>
          <Link
            href="/trade-evaluator"
            className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
          >
            ✨ Trade Evaluator
          </Link>
        </div>
      </div>

      {/* Filters */}
      {data?.teams.length ? (
        <Card>
          <CardBody className="flex flex-wrap items-end gap-4">
            <Filter label="Team">
              <select
                className="min-h-11 w-full rounded-md border border-ink-300 px-3 py-2 text-base sm:min-h-0 sm:w-auto sm:text-sm"
                value={selectedRoster}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedRoster(v === "all" ? "all" : parseInt(v));
                }}
              >
                <option value="all">All</option>
                {data.teams.map((t) => (
                  <option key={t.rosterId} value={t.rosterId}>
                    {t.teamName}
                  </option>
                ))}
              </select>
            </Filter>
            <Filter label="Position">
              <select
                className="min-h-11 w-full rounded-md border border-ink-300 px-3 py-2 text-base sm:min-h-0 sm:w-auto sm:text-sm"
                value={selectedPos}
                onChange={(e) => setSelectedPos(e.target.value)}
              >
                <option value="all">All</option>
                {positions.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </Filter>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={showDraftDetails}
                onChange={(e) => setShowDraftDetails(e.target.checked)}
                className="h-5 w-5 accent-brand-600"
              />
              Show previous draft details
            </label>
          </CardBody>
        </Card>
      ) : null}

      {/* Team strip — horizontal scroll on mobile, wraps on larger screens. */}
      {data && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {data.teams.map((t) => {
            const roster = data.currentRosters.find((r) => r.roster_id === t.rosterId);
            const user = data.currentUsers.find((u) => u.user_id === roster?.owner_id);
            const active = selectedRoster === t.rosterId;
            return (
              <div
                key={t.rosterId}
                className={cn(
                  "flex shrink-0 items-stretch overflow-hidden rounded-full border transition-colors",
                  active
                    ? "border-brand-300 bg-brand-50"
                    : "border-ink-200 bg-white",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedRoster(active ? "all" : t.rosterId)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 pl-3 pr-2 text-sm",
                    active ? "text-brand-900" : "text-ink-700 hover:bg-ink-50",
                  )}
                  title={active ? "Show all teams" : `Filter to ${t.teamName}`}
                >
                  <Avatar avatarId={user?.avatar} alt={t.teamName} size={20} />
                  <span className="whitespace-nowrap">{t.teamName}</span>
                </button>
                <Link
                  href={`/team/${t.rosterId}`}
                  aria-label={`${t.teamName} team details`}
                  className={cn(
                    "flex items-center border-l px-2.5",
                    active
                      ? "border-brand-200 text-brand-700 hover:bg-brand-100"
                      : "border-ink-100 text-ink-400 hover:bg-ink-50 hover:text-ink-600",
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
              </div>
            );
          })}
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

          <PlayerTable
            players={filteredPlayers}
            selected={selectedKeepers}
            onSelectionChange={(set) => setSelectedKeepers(new Set(set))}
            missing={missingForTable}
            showDraftDetails={showDraftDetails}
            maxKeepers={MAX_KEEPERS_PER_TEAM}
          />

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

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex w-full flex-col gap-1 text-xs font-medium uppercase tracking-wide text-ink-500 sm:w-auto">
      {label}
      <div className="text-sm normal-case text-ink-900">{children}</div>
    </label>
  );
}

function areSetsEqual(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
