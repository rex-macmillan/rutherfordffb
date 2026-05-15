import { useCallback, useMemo, useState } from "react";
import Bracket from "../components/Bracket";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { Skeleton } from "../components/ui/Skeleton";
import { Avatar } from "../components/ui/Avatar";
import { Table, THead, TBody, TR, TH, TD } from "../components/ui/Table";
import { cn } from "../lib/cn";
import { useCurrentLeague } from "../lib/leagueHooks";
import {
  useLeague,
  useLeagueUsers,
  useLosersBracket,
  useMatchupsByWeek,
  useRosters,
  useWinnersBracket,
} from "../lib/sleeperQueries";

interface BracketEntry {
  round: number;
  t1: number | null;
  t2: number | null;
  winner: number | null;
  matchup_id: number;
  seed1?: number | null;
  seed2?: number | null;
  score1?: number | null;
  score2?: number | null;
}

interface RowData {
  place: number;
  team: string;
  points: number;
  draftPos: number;
  avatarId?: string | null;
}

const PLAYOFF_DRAFT_PICK_SEQUENCE = [7, 8, 9, 10, 11, 12, 5, 6, 3, 4, 2, 1];

function resolveBracket(rawArr: any[] | undefined, seedMap: Record<number, number>): BracketEntry[] {
  if (!rawArr) return [];
  const sorted = [...rawArr].sort((a, b) => (a.r ?? 0) - (b.r ?? 0));
  const outcomeMap = new Map<number, { winner: number | null; loser: number | null }>();
  const resolved: BracketEntry[] = [];
  for (const e of sorted) {
    const matchId = e.m ?? e.matchup_id;
    const getRoster = (obj: any): number | null => {
      if (typeof obj === "number") return obj;
      if (obj && typeof obj === "object") {
        if (obj.w) return outcomeMap.get(obj.w)?.winner ?? null;
        if (obj.l) return outcomeMap.get(obj.l)?.loser ?? null;
      }
      return null;
    };
    const t1Id = getRoster(e.t1);
    const t2Id = getRoster(e.t2);
    const winnerId: number | null = typeof e.w === "number" ? e.w : null;
    const loserId: number | null =
      winnerId != null ? (winnerId === t1Id ? t2Id : t1Id) : null;
    outcomeMap.set(matchId, { winner: winnerId, loser: loserId });
    resolved.push({
      round: e.r ?? 0,
      t1: t1Id,
      t2: t2Id,
      winner: winnerId,
      matchup_id: matchId,
      seed1: t1Id != null ? seedMap[t1Id] ?? null : null,
      seed2: t2Id != null ? seedMap[t2Id] ?? null : null,
      score1: null,
      score2: null,
    });
  }
  return resolved;
}

export default function PlayoffsPage() {
  const { league: currentLeague, isFallbackSeason } = useCurrentLeague();
  // In fallback mode the "current" league IS the just-completed season —
  // its bracket is what we want to show. In normal mode, the just-completed
  // season is one hop back via previous_league_id.
  const prevLeagueId = isFallbackSeason
    ? currentLeague?.league_id
    : currentLeague?.previous_league_id;
  const prevLeagueQ = useLeague(prevLeagueId);
  const prevLeague = prevLeagueQ.data;

  const rostersQ = useRosters(prevLeagueId);
  const usersQ = useLeagueUsers(prevLeagueId);
  const winQ = useWinnersBracket(prevLeagueId);
  const loseQ = useLosersBracket(prevLeagueId);

  const playoffStartWeek = parseInt(
    (prevLeague as any)?.settings?.playoff_week_start || "15",
  );

  const { idToName, idToAvatar, seedMap } = useMemo(() => {
    const idToName: Record<number, string> = {};
    const idToAvatar: Record<number, string | undefined> = {};
    const seedMap: Record<number, number> = {};
    if (!rostersQ.data || !usersQ.data) return { idToName, idToAvatar, seedMap };
    const owner: Record<string, { name: string; avatar?: string }> = {};
    usersQ.data.forEach((u) => {
      owner[u.user_id] = {
        name: u.metadata?.team_name || u.display_name || "",
        avatar: u.avatar ?? u.metadata?.avatar,
      };
    });
    rostersQ.data.forEach((r) => {
      const info = owner[r.owner_id];
      idToName[r.roster_id] = info?.name || `Team ${r.roster_id}`;
      idToAvatar[r.roster_id] = info?.avatar;
      const seedVal =
        (r as any).settings?.playoff_seed ?? (r as any).settings?.seed ?? null;
      if (seedVal != null) seedMap[r.roster_id] = parseInt(seedVal);
    });
    return { idToName, idToAvatar, seedMap };
  }, [rostersQ.data, usersQ.data]);

  const winnersResolved = useMemo(
    () => resolveBracket(winQ.data, seedMap),
    [winQ.data, seedMap],
  );
  const losersResolved = useMemo(
    () => resolveBracket(loseQ.data, seedMap),
    [loseQ.data, seedMap],
  );

  const neededWeeks = useMemo(() => {
    const set = new Set<number>();
    [...winnersResolved, ...losersResolved].forEach((e) => {
      set.add(playoffStartWeek + e.round - 1);
    });
    return Array.from(set);
  }, [winnersResolved, losersResolved, playoffStartWeek]);

  const matchupsQs = useMatchupsByWeek(
    prevLeagueId,
    neededWeeks.length ? neededWeeks : undefined,
  );

  const scoreLookup = useMemo(() => {
    const map = new Map<string, number>();
    matchupsQs.forEach((q, idx) => {
      if (!q.data) return;
      const week = neededWeeks[idx];
      (q.data as any[]).forEach((m) => map.set(`${week}-${m.roster_id}`, m.points));
    });
    return map;
  }, [matchupsQs, neededWeeks]);

  const attachScores = useCallback(
    (entries: BracketEntry[]) =>
      entries.map((en) => {
        const week = playoffStartWeek + en.round - 1;
        const s1 =
          en.t1 != null ? scoreLookup.get(`${week}-${en.t1}`) ?? null : null;
        const s2 =
          en.t2 != null ? scoreLookup.get(`${week}-${en.t2}`) ?? null : null;
        return { ...en, score1: s1, score2: s2 };
      }),
    [scoreLookup, playoffStartWeek],
  );

  const winnersFinal = useMemo(
    () => attachScores(winnersResolved),
    [winnersResolved, attachScores],
  );
  const losersFinal = useMemo(
    () => attachScores(losersResolved),
    [losersResolved, attachScores],
  );

  const rows = useMemo<RowData[]>(() => {
    if (!rostersQ.data || winnersFinal.length === 0) return [];
    const ptsMap = new Map<number, number>();
    rostersQ.data.forEach((r) =>
      ptsMap.set(r.roster_id, (r as any).settings?.fpts ?? 0),
    );

    const getWinner = (m: BracketEntry) => m.winner!;
    const getLoser = (m: BracketEntry) => (m.t1 === m.winner ? m.t2! : m.t1!);

    const wMax = Math.max(...winnersFinal.map((e) => e.round));
    const lMax = losersFinal.length ? Math.max(...losersFinal.map((e) => e.round)) : 0;

    const finalsArr = winnersFinal.filter((e) => e.round === wMax);
    const semiArr = winnersFinal.filter((e) => e.round === wMax - 1);

    const champMatch = finalsArr[0];
    const thirdMatch = finalsArr.length > 1 ? finalsArr[1] : null;
    const fifthMatch = semiArr.length ? semiArr[semiArr.length - 1] : null;

    const losersFinalArr = losersFinal.filter((e) => e.round === lMax);
    const lastPlaceMatch = losersFinalArr[0];
    const tenthMatch = losersFinalArr.length > 1 ? losersFinalArr[1] : null;
    const losersSemiArr = losersFinal.filter((e) => e.round === lMax - 1);
    const eighthMatch = losersSemiArr.length
      ? losersSemiArr[losersSemiArr.length - 1]
      : null;

    const order: number[] = [];
    if (champMatch && champMatch.winner != null)
      order.push(getWinner(champMatch), getLoser(champMatch));
    if (thirdMatch && thirdMatch.winner != null)
      order.push(getWinner(thirdMatch), getLoser(thirdMatch));
    if (fifthMatch && fifthMatch.winner != null)
      order.push(getWinner(fifthMatch), getLoser(fifthMatch));
    if (eighthMatch && eighthMatch.winner != null)
      order.push(getLoser(eighthMatch), getWinner(eighthMatch));
    if (tenthMatch && tenthMatch.winner != null)
      order.push(getLoser(tenthMatch), getWinner(tenthMatch));
    if (lastPlaceMatch && lastPlaceMatch.winner != null)
      order.push(getLoser(lastPlaceMatch), getWinner(lastPlaceMatch));

    const standings = order.map((rid, idx) => ({
      place: idx + 1,
      team: idToName[rid] || `Team ${rid}`,
      points: ptsMap.get(rid) ?? 0,
      avatarId: idToAvatar[rid] ?? null,
    }));

    const draftArr = PLAYOFF_DRAFT_PICK_SEQUENCE.map((p) => {
      const s = standings.find((st) => st.place === p);
      return s ? { place: p, team: s.team } : { place: p, team: "" };
    });

    return standings.map((st) => {
      const dIdx = draftArr.findIndex((d) => d.team === st.team);
      return { ...st, draftPos: dIdx + 1 };
    });
  }, [rostersQ.data, winnersFinal, losersFinal, idToName, idToAvatar]);

  const [sortBy, setSortBy] = useState<"place" | "draftPos">("place");

  const seasonLabel = prevLeague?.season || "";
  const loading =
    prevLeagueQ.isLoading ||
    rostersQ.isLoading ||
    usersQ.isLoading ||
    winQ.isLoading ||
    loseQ.isLoading;
  const error =
    (prevLeagueQ.error as Error | null) ??
    (rostersQ.error as Error | null) ??
    (usersQ.error as Error | null) ??
    (winQ.error as Error | null) ??
    (loseQ.error as Error | null);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        {seasonLabel ? `${seasonLabel} Playoffs` : "Playoffs"}
      </h1>

      {error && (
        <Card>
          <CardBody className="text-sm text-red-700">{error.message}</CardBody>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Final Standings &amp; Next Year&apos;s Draft Order</CardTitle>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <Table>
              <THead>
                <TR>
                  <TH
                    className={cn(
                      "cursor-pointer hover:text-brand-700",
                      sortBy === "place" && "text-brand-700",
                    )}
                    onClick={() => setSortBy("place")}
                  >
                    Place {sortBy === "place" ? "▼" : ""}
                  </TH>
                  <TH
                    className={cn(
                      "cursor-pointer hover:text-brand-700",
                      sortBy === "draftPos" && "text-brand-700",
                    )}
                    onClick={() => setSortBy("draftPos")}
                  >
                    Draft {sortBy === "draftPos" ? "▼" : ""}
                  </TH>
                  <TH>Team</TH>
                  <TH>Points</TH>
                </TR>
              </THead>
              <TBody>
                {[...rows]
                  .sort((a, b) =>
                    sortBy === "place" ? a.place - b.place : a.draftPos - b.draftPos,
                  )
                  .map((r) => (
                    <TR key={r.team}>
                      <TD className="font-semibold">{r.place}</TD>
                      <TD>{r.draftPos}</TD>
                      <TD>
                        <span className="flex items-center gap-2">
                          <Avatar avatarId={r.avatarId} alt={r.team} size={24} />
                          <span className="font-medium">{r.team}</span>
                        </span>
                      </TD>
                      <TD className="tabular-nums">{r.points.toFixed(2)}</TD>
                    </TR>
                  ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Winners Bracket</CardTitle>
        </CardHeader>
        <CardBody>
          {winnersFinal.length ? (
            <Bracket entries={winnersFinal} rosterIdToName={idToName} />
          ) : (
            <p className="text-sm text-ink-500">No data</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Losers Bracket</CardTitle>
        </CardHeader>
        <CardBody>
          {losersFinal.length ? (
            <Bracket entries={losersFinal} rosterIdToName={idToName} isLosers />
          ) : (
            <p className="text-sm text-ink-500">No data</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
