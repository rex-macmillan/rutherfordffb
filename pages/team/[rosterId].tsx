import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useCurrentLeague, useKeeperHelperData } from "../../lib/leagueHooks";
import { useLeagueKeepers } from "../../lib/leagueState";
import { Avatar } from "../../components/ui/Avatar";
import { Card, CardBody, CardHeader, CardTitle } from "../../components/ui/Card";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { Skeleton } from "../../components/ui/Skeleton";
import { cn } from "../../lib/cn";

export default function TeamDetailPage() {
  const router = useRouter();
  const rosterId =
    typeof router.query.rosterId === "string"
      ? parseInt(router.query.rosterId)
      : NaN;

  const { league, season, isLoading: leagueLoading } = useCurrentLeague();
  const { data, isLoading } = useKeeperHelperData(league, season);
  const { data: allKeepers } = useLeagueKeepers(league?.league_id);

  const team = useMemo(() => {
    if (!data || isNaN(rosterId)) return null;
    const t = data.teams.find((tm) => tm.rosterId === rosterId);
    if (!t) return null;
    const roster = data.currentRosters.find((r) => r.roster_id === rosterId);
    const owner = data.currentUsers.find((u) => u.user_id === roster?.owner_id);
    const players = data.rows.filter((p) => p.rosterId === rosterId);
    const delta = data.deltas.get(rosterId);
    return { ...t, roster, owner, players, delta };
  }, [data, rosterId]);

  const savedKeepers = useMemo(() => {
    const entry = allKeepers.find((k) => k.rosterId === rosterId);
    return entry?.playerIds ?? [];
  }, [allKeepers, rosterId]);

  if (leagueLoading || isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!team) {
    return (
      <div>
        <p className="mb-3 text-ink-600">Roster not found.</p>
        <Link href="/" className="text-brand-700 underline">
          ← Back to Keeper Helper
        </Link>
      </div>
    );
  }

  const positionGroups = ["QB", "RB", "WR", "TE"] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar
          avatarId={team.owner?.avatar ?? team.owner?.metadata?.avatar}
          alt={team.teamName}
          size={48}
        />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold sm:text-2xl">
            {team.teamName}
          </h1>
          {team.owner && (
            <p className="truncate text-sm text-ink-500">
              {team.owner.display_name}
            </p>
          )}
        </div>
        <Link
          href="/"
          className="ml-auto flex shrink-0 items-center text-sm text-brand-700 underline"
        >
          ← All teams
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Saved Keepers</CardTitle>
          </CardHeader>
          <CardBody>
            {savedKeepers.length === 0 ? (
              <p className="text-sm text-ink-500">None yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {savedKeepers.map((pid) => {
                  const p = team.players.find((pp) => pp.playerId === pid);
                  if (!p) return null;
                  return (
                    <li key={pid} className="flex items-center justify-between">
                      <span>{p.name}</span>
                      <span className="text-xs text-ink-500">
                        R{p.keeperRound}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Draft Picks</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <div>
              <span className="font-medium text-emerald-700">Extra: </span>
              {team.delta?.extra.length
                ? team.delta.extra.map((r) => `R${r}`).join(", ")
                : "—"}
            </div>
            <div>
              <span className="font-medium text-red-700">Missing: </span>
              {team.delta?.missing.length
                ? team.delta.missing.map((r) => `R${r}`).join(", ")
                : "—"}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Roster Size</CardTitle>
          </CardHeader>
          <CardBody className="text-sm">
            <div className="text-3xl font-semibold">{team.players.length}</div>
            <div className="text-ink-500">players on roster</div>
          </CardBody>
        </Card>
      </div>

      {positionGroups.map((pos) => {
        const group = team.players
          .filter((p) => p.position === pos)
          .sort((a, b) => (a.keeperRound ?? 99) - (b.keeperRound ?? 99));
        if (group.length === 0) return null;
        return (
          <Card key={pos}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {pos}
                <span className="text-xs font-normal text-ink-500">
                  ({group.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <div className="relative scroll-x-fade">
                <div className="scroll-x no-scrollbar overflow-x-auto">
                  <Table className="min-w-[34rem]">
                    <THead>
                      <TR>
                        <TH className="sticky left-0 top-0 z-20 bg-ink-100">
                          Player
                        </TH>
                        <TH className="w-20">NFL Team</TH>
                        <TH className="w-24">Rank</TH>
                        <TH className="w-24">Keeper</TH>
                        <TH className="w-24">Value</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {group.map((p) => (
                        <TR key={p.playerId} className={cn(`row-pos-${pos}`)}>
                          <TD className="sticky left-0 z-10 bg-inherit font-medium whitespace-nowrap">
                            {p.name}
                          </TD>
                          <TD>{p.teamAbbr}</TD>
                          <TD>{p.pprRank ?? "—"}</TD>
                          <TD>
                            {p.keeperRound != null ? `R${p.keeperRound}` : "—"}
                          </TD>
                          <TD>{p.valueScore?.toFixed(1) ?? "—"}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
