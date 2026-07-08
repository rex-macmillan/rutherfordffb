import Link from "next/link";
import { useMemo } from "react";
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
import { cn } from "../lib/cn";

interface TeamRow {
  rosterId: number;
  teamName: string;
  ownerName: string;
  avatarId?: string | null;
  keeperCount: number | null; // null = unknown (local mode, other teams)
  extra: number[];
  missing: number[];
  isMine: boolean;
}

export default function TeamsPage() {
  const { username } = useIdentity();
  const { league, season, isLoading: leagueLoading, error: leagueError } =
    useCurrentLeague();
  const { data, isLoading: dataLoading, error: dataError } =
    useKeeperHelperData(league, season);
  const { data: allKeepers, isShared } = useLeagueKeepers(league?.league_id);

  const rows = useMemo<TeamRow[]>(() => {
    if (!data) return [];
    const myRosterId = findMyRosterId(data.currentUsers, data.currentRosters, username);
    const userByOwner = new Map(data.currentUsers.map((u) => [u.user_id, u]));

    const list = data.teams.map((t) => {
      const roster = data.currentRosters.find((r) => r.roster_id === t.rosterId);
      const owner = userByOwner.get(roster?.owner_id ?? "");
      const delta = data.deltas.get(t.rosterId);
      const isMine = t.rosterId === myRosterId;

      let keeperCount: number | null = null;
      if (isShared) {
        keeperCount =
          allKeepers.find((k) => k.rosterId === t.rosterId)?.playerIds.length ?? 0;
      } else if (isMine) {
        keeperCount = allKeepers[0]?.playerIds.length ?? 0;
      }

      return {
        rosterId: t.rosterId,
        teamName: t.teamName,
        ownerName: owner?.display_name ?? "",
        avatarId: owner?.avatar ?? owner?.metadata?.avatar,
        keeperCount,
        extra: delta?.extra ?? [],
        missing: delta?.missing ?? [],
        isMine,
      };
    });

    // Your team first, then alphabetical.
    return list.sort((a, b) => {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
      return a.teamName.localeCompare(b.teamName);
    });
  }, [data, username, allKeepers, isShared]);

  const loading = leagueLoading || dataLoading;
  const error = leagueError ?? dataError;

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Teams</h1>
        <p className="text-sm text-ink-500">
          Every roster in the league — keepers declared, picks gained and lost.
          Tap a team for the full breakdown.
        </p>
      </div>

      {error && (
        <Card>
          <CardBody className="text-sm text-red-700">{error.message}</CardBody>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <ul className="divide-y divide-ink-100">
            {rows.map((t) => (
              <li key={t.rosterId}>
                <Link
                  href={`/team/${t.rosterId}`}
                  className="flex min-h-[64px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ink-50"
                >
                  <Avatar avatarId={t.avatarId} alt={t.teamName} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink-900">
                        {t.teamName}
                      </span>
                      {t.isMine && (
                        <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-brand-800">
                          You
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      {t.ownerName}
                      {t.extra.length > 0 && (
                        <span className="text-emerald-700">
                          {" "}
                          · +{t.extra.map((r) => `R${r}`).join(", +")}
                        </span>
                      )}
                      {t.missing.length > 0 && (
                        <span className="text-red-700">
                          {" "}
                          · −{t.missing.map((r) => `R${r}`).join(", −")}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {t.keeperCount != null && (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                          t.keeperCount > 0
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-ink-100 text-ink-500",
                        )}
                      >
                        {t.keeperCount} {t.keeperCount === 1 ? "keeper" : "keepers"}
                      </span>
                    )}
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 text-ink-300"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!isShared && (
        <p className="text-xs text-ink-400">
          Local mode — keeper counts are only visible for your own team. Set up
          Supabase to see everyone&apos;s declarations.
        </p>
      )}
    </div>
  );
}
