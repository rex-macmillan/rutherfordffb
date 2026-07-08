import Link from "next/link";
import { useMemo } from "react";
import { CountdownBanner } from "../components/CountdownBanner";
import { NavIcon } from "../components/NavIcon";
import { Avatar } from "../components/ui/Avatar";
import { Card, CardBody } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import {
  findMyRosterId,
  useCurrentLeague,
  useKeeperHelperData,
} from "../lib/leagueHooks";
import { useIdentity } from "../lib/identity";
import { useLeagueKeepers } from "../lib/leagueState";
import { MAX_KEEPERS_PER_TEAM } from "../lib/keepers";
import { NAV_LINKS } from "../lib/navLinks";
import { cn } from "../lib/cn";

/** One-line blurbs for the Home quick-link grid, keyed by route. */
const LINK_BLURBS: Record<string, string> = {
  "/keepers": "Pick and save your keepers",
  "/draft": "Board, order & recap",
  "/teams": "Every roster in the league",
  "/rules": "Rulebook, chat & demo",
  "/advisor": "AI keeper recommendations",
  "/trade-evaluator": "AI trade analysis",
  "/playoffs": "Last season's brackets",
};

export default function HomePage() {
  const { username } = useIdentity();
  const {
    league,
    season,
    apiSeason,
    isFallbackSeason,
    isLoading: leagueLoading,
  } = useCurrentLeague();
  const { data, isLoading: dataLoading } = useKeeperHelperData(league, season);
  const { data: allLeagueKeepers, isShared } = useLeagueKeepers(league?.league_id);

  const myRosterId = useMemo(
    () =>
      data ? findMyRosterId(data.currentUsers, data.currentRosters, username) : undefined,
    [data, username],
  );

  const myTeam = useMemo(() => {
    if (!data || myRosterId == null) return null;
    const team = data.teams.find((t) => t.rosterId === myRosterId);
    if (!team) return null;
    const roster = data.currentRosters.find((r) => r.roster_id === myRosterId);
    const owner = data.currentUsers.find((u) => u.user_id === roster?.owner_id);
    const entry = isShared
      ? allLeagueKeepers.find((k) => k.rosterId === myRosterId)
      : allLeagueKeepers[0];
    return {
      ...team,
      avatarId: owner?.avatar ?? owner?.metadata?.avatar,
      savedCount: entry?.playerIds.length ?? 0,
    };
  }, [data, myRosterId, allLeagueKeepers, isShared]);

  const declared = useMemo(() => {
    if (!data || !isShared) return null;
    const count = allLeagueKeepers.filter((k) => k.playerIds.length > 0).length;
    return { count, total: data.teams.length };
  }, [data, allLeagueKeepers, isShared]);

  const loading = leagueLoading || dataLoading;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
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

      {/* The top bar already carries the league name — no need to repeat it. */}
      <h1 className="sr-only">Home</h1>

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {/* Your team, front and center. */}
      {myTeam && (
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar avatarId={myTeam.avatarId} alt={myTeam.teamName} size={48} />
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">{myTeam.teamName}</div>
                <div
                  className={cn(
                    "text-sm",
                    myTeam.savedCount > 0 ? "text-emerald-700" : "text-amber-700",
                  )}
                >
                  {myTeam.savedCount > 0
                    ? `${myTeam.savedCount} of ${MAX_KEEPERS_PER_TEAM} keepers saved`
                    : "No keepers saved yet"}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/keepers"
                className="flex min-h-11 flex-1 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:flex-none"
              >
                Manage keepers
              </Link>
              <Link
                href={`/team/${myTeam.rosterId}`}
                className="flex min-h-11 flex-1 items-center justify-center rounded-md border border-ink-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-ink-50 sm:flex-none"
              >
                My team
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      {/* League-wide keeper declaration progress (shared mode only). */}
      {declared && (
        <Card>
          <CardBody className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink-800">
                Keepers declared across the league
              </span>
              <span className="text-sm tabular-nums text-ink-500">
                {declared.count} / {declared.total} teams
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-[width]"
                style={{
                  width: `${declared.total ? (declared.count / declared.total) * 100 : 0}%`,
                }}
              />
            </div>
            <Link href="/teams" className="inline-block text-sm text-brand-700 underline">
              See who&apos;s declared →
            </Link>
          </CardBody>
        </Card>
      )}

      {/* Everything else, one tap away. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {NAV_LINKS.filter((l) => l.href !== "/").map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="group flex flex-col gap-2 rounded-xl border border-ink-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-200 hover:bg-brand-50/40"
          >
            <NavIcon
              name={l.icon}
              className="h-6 w-6 text-ink-400 transition-colors group-hover:text-brand-600"
            />
            <div>
              <div className="text-sm font-semibold text-ink-900">{l.full}</div>
              <div className="text-xs text-ink-500">{LINK_BLURBS[l.href]}</div>
            </div>
          </Link>
        ))}
      </div>

      <p className="text-xs text-ink-400">
        {season && <span>Season {season} · </span>}
        {isShared
          ? "Shared league mode — keeper picks are visible to everyone."
          : "Local mode — keeper picks are saved to this device only."}
      </p>
    </div>
  );
}
