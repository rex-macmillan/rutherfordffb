/**
 * Draft slot-selection order for the upcoming season.
 *
 * Per §4 of the rulebook, slot selection happens BEFORE keepers lock and uses
 * a "choice order" based on the previous season's final standings. The order
 * gives the 7th-place team the first choice of slot and the champion the last
 * (so the worst-finishing teams don't all clump at the top of the snake).
 *
 * This hook:
 *  - Resolves the right previous-season league (handles fallback when the
 *    current-season league hasn't been re-created yet).
 *  - Computes final standings from the winners + losers brackets.
 *  - Applies PLAYOFF_DRAFT_PICK_SEQUENCE to give each team a selection slot.
 *  - Optionally surfaces the upcoming draft's slot assignments (from Sleeper's
 *    slot_to_roster_id) so the page can show which teams have already locked
 *    in their pick.
 */

import { useMemo } from "react";
import { useCurrentLeague } from "./leagueHooks";
import {
  useDraft,
  useLeague,
  useLeagueDrafts,
  useLeagueUsers,
  useLosersBracket,
  useRosters,
  useWinnersBracket,
} from "./sleeperQueries";

export const PLAYOFF_DRAFT_PICK_SEQUENCE = [
  7, 8, 9, 10, 11, 12, 5, 6, 3, 4, 2, 1,
] as const;

export interface DraftOrderRow {
  /** 1 = champion, 12 = last place. From previous-season standings. */
  place: number;
  /** 1 = picks slot first, 12 = picks slot last. Per PLAYOFF_DRAFT_PICK_SEQUENCE. */
  selectionOrder: number;
  rosterId: number;
  teamName: string;
  managerName?: string;
  avatarId?: string | null;
  pointsFor: number;
  /** Slot number the team chose in the upcoming draft, if Sleeper has it set. */
  chosenSlot?: number;
}

interface RawBracketEntry {
  r?: number;
  m?: number;
  matchup_id?: number;
  t1: any;
  t2: any;
  w: number | null;
}

interface ResolvedEntry {
  round: number;
  t1: number | null;
  t2: number | null;
  winner: number | null;
}

function resolveBracket(raw: any[] | undefined): ResolvedEntry[] {
  if (!raw) return [];
  const sorted = [...raw].sort(
    (a, b) => (a.r ?? 0) - (b.r ?? 0),
  ) as RawBracketEntry[];
  const outcomeMap = new Map<number, { winner: number | null; loser: number | null }>();
  const out: ResolvedEntry[] = [];
  for (const e of sorted) {
    const matchId = (e.m ?? e.matchup_id)!;
    const resolveSide = (obj: any): number | null => {
      if (typeof obj === "number") return obj;
      if (obj && typeof obj === "object") {
        if (obj.w) return outcomeMap.get(obj.w)?.winner ?? null;
        if (obj.l) return outcomeMap.get(obj.l)?.loser ?? null;
      }
      return null;
    };
    const t1 = resolveSide(e.t1);
    const t2 = resolveSide(e.t2);
    const winner = typeof e.w === "number" ? e.w : null;
    const loser = winner != null ? (winner === t1 ? t2 : t1) : null;
    outcomeMap.set(matchId, { winner, loser });
    out.push({ round: e.r ?? 0, t1, t2, winner });
  }
  return out;
}

/**
 * Derive a 1..12 final-place ordering for a 12-team league using the
 * resolved winners + losers brackets.
 *
 * Returns an array where index 0 = 1st place rosterId, …, index 11 = last
 * place. If we can't fully resolve (incomplete bracket), missing slots come
 * back as undefined.
 */
function deriveFinalStandings(
  winners: ResolvedEntry[],
  losers: ResolvedEntry[],
): (number | undefined)[] {
  if (winners.length === 0) return [];
  const winnerOf = (m: ResolvedEntry) => m.winner ?? undefined;
  const loserOf = (m: ResolvedEntry) =>
    m.winner != null ? (m.t1 === m.winner ? m.t2 ?? undefined : m.t1 ?? undefined) : undefined;

  const wMax = Math.max(...winners.map((e) => e.round));
  const lMax = losers.length ? Math.max(...losers.map((e) => e.round)) : 0;

  const finals = winners.filter((e) => e.round === wMax);
  const semis = winners.filter((e) => e.round === wMax - 1);
  const losersFinal = losers.filter((e) => e.round === lMax);
  const losersSemi = losers.filter((e) => e.round === lMax - 1);

  const champMatch = finals[0];
  const thirdMatch = finals[1];
  const fifthMatch = semis.length ? semis[semis.length - 1] : undefined;
  const lastMatch = losersFinal[0];
  const tenthMatch = losersFinal[1];
  const eighthMatch = losersSemi.length ? losersSemi[losersSemi.length - 1] : undefined;

  const order: (number | undefined)[] = [];
  if (champMatch) order.push(winnerOf(champMatch), loserOf(champMatch));
  if (thirdMatch) order.push(winnerOf(thirdMatch), loserOf(thirdMatch));
  if (fifthMatch) order.push(winnerOf(fifthMatch), loserOf(fifthMatch));
  if (eighthMatch) order.push(loserOf(eighthMatch), winnerOf(eighthMatch)); // 7th = loser of 8th-place game
  if (tenthMatch) order.push(loserOf(tenthMatch), winnerOf(tenthMatch));
  if (lastMatch) order.push(loserOf(lastMatch), winnerOf(lastMatch));
  return order;
}

export interface DraftOrderResult {
  rows: DraftOrderRow[];
  seasonLabel: string;
  /** True when the upcoming draft is set up in Sleeper and slots are assigned. */
  upcomingDraftHasSlots: boolean;
  isLoading: boolean;
  error: Error | null;
}

export function useDraftSelectionOrder(): DraftOrderResult {
  const { league: currentLeague, isFallbackSeason } = useCurrentLeague();

  // The standings that drive selection order come from the LAST COMPLETED
  // season. In fallback mode, "current" already IS that season (its bracket
  // is what we want). In normal mode, it's one hop back.
  const standingsLeagueId = isFallbackSeason
    ? currentLeague?.league_id
    : currentLeague?.previous_league_id;

  const standingsLeagueQ = useLeague(standingsLeagueId);
  const rostersQ = useRosters(standingsLeagueId);
  const usersQ = useLeagueUsers(standingsLeagueId);
  const winQ = useWinnersBracket(standingsLeagueId);
  const loseQ = useLosersBracket(standingsLeagueId);

  // The upcoming draft (for showing chosen slots if any are set). When in
  // fallback mode there's no upcoming-league draft yet so this stays empty.
  const upcomingLeagueId = isFallbackSeason ? undefined : currentLeague?.league_id;
  const upcomingDraftsQ = useLeagueDrafts(upcomingLeagueId);
  const upcomingDraftId = upcomingDraftsQ.data?.[0]?.draft_id;
  const upcomingDraftQ = useDraft(upcomingDraftId);

  const isLoading =
    standingsLeagueQ.isLoading ||
    rostersQ.isLoading ||
    usersQ.isLoading ||
    winQ.isLoading ||
    loseQ.isLoading;

  const error =
    (standingsLeagueQ.error as Error | null) ??
    (rostersQ.error as Error | null) ??
    (usersQ.error as Error | null) ??
    (winQ.error as Error | null) ??
    (loseQ.error as Error | null) ??
    null;

  const seasonLabel = standingsLeagueQ.data?.season ?? "";

  // Pre-compute the slot_to_roster_id reverse map.
  const upcomingRosterToSlot = useMemo(() => {
    const slotMap: Record<string, number> | undefined =
      upcomingDraftQ.data?.slot_to_roster_id || upcomingDraftQ.data?.draft_order;
    if (!slotMap) return new Map<number, number>();
    const out = new Map<number, number>();
    Object.entries(slotMap).forEach(([slot, rid]) => {
      out.set(rid as number, parseInt(slot));
    });
    return out;
  }, [upcomingDraftQ.data]);

  const rows = useMemo<DraftOrderRow[]>(() => {
    if (!rostersQ.data || !usersQ.data || !winQ.data) return [];
    const winners = resolveBracket(winQ.data);
    const losers = resolveBracket(loseQ.data);
    const standings = deriveFinalStandings(winners, losers);
    if (standings.length === 0) return [];

    // Owner lookups.
    const ownerInfo = new Map<
      string,
      { name: string; avatar?: string; managerDisplayName?: string }
    >();
    usersQ.data.forEach((u) => {
      ownerInfo.set(u.user_id, {
        name: u.metadata?.team_name || u.display_name || "",
        avatar: u.avatar ?? u.metadata?.avatar,
        managerDisplayName: u.display_name,
      });
    });
    const rosterInfo = new Map<
      number,
      {
        teamName: string;
        managerName?: string;
        avatar?: string | null;
        pointsFor: number;
      }
    >();
    rostersQ.data.forEach((r) => {
      const info = ownerInfo.get(r.owner_id);
      rosterInfo.set(r.roster_id, {
        teamName: info?.name || `Team ${r.roster_id}`,
        managerName: info?.managerDisplayName,
        avatar: info?.avatar,
        pointsFor: (r as any).settings?.fpts ?? 0,
      });
    });

    // Build the place → rosterId map.
    const placeToRoster = new Map<number, number>();
    standings.forEach((rid, idx) => {
      if (rid != null) placeToRoster.set(idx + 1, rid);
    });

    // Walk the selection sequence to compute draft order rows.
    const out: DraftOrderRow[] = [];
    PLAYOFF_DRAFT_PICK_SEQUENCE.forEach((place, idx) => {
      const rid = placeToRoster.get(place);
      if (rid == null) return;
      const info = rosterInfo.get(rid);
      out.push({
        place,
        selectionOrder: idx + 1,
        rosterId: rid,
        teamName: info?.teamName ?? `Team ${rid}`,
        managerName: info?.managerName,
        avatarId: info?.avatar,
        pointsFor: info?.pointsFor ?? 0,
        chosenSlot: upcomingRosterToSlot.get(rid),
      });
    });
    return out;
  }, [rostersQ.data, usersQ.data, winQ.data, loseQ.data, upcomingRosterToSlot]);

  return {
    rows,
    seasonLabel,
    upcomingDraftHasSlots: upcomingRosterToSlot.size > 0,
    isLoading,
    error,
  };
}
