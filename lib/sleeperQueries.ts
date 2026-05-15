/**
 * TanStack Query hooks for Sleeper + FantasyCalc.
 *
 * Each hook is a thin wrapper around the raw fetch in sleeperApi.ts. Stale
 * times are tuned to the volatility of the underlying data:
 *
 *  - players blob: ~5 MB, changes rarely → 24h
 *  - league/roster metadata: changes between weeks → 1h
 *  - matchups/scores during the season: live-ish → 5m
 *  - traded picks / brackets: change with transactions → 15m
 *  - FantasyCalc ranks: market data, refreshes frequently → 15m
 */

import { useQueries, useQuery } from "@tanstack/react-query";
import {
  DraftPick,
  League,
  LeagueUser,
  NFLState,
  PlayersBlob,
  Roster,
  SleeperUser,
  TradedPick,
  getDraft,
  getDraftPicks,
  getFCRanks,
  getLeague,
  getLeagueDrafts,
  getLeagueUsers,
  getLosersBracket,
  getMatchups,
  getNFLState,
  getPlayers,
  getRosters,
  getTradedPicks,
  getUserByUsername,
  getUserLeagues,
  getWinnersBracket,
} from "./sleeperApi";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ---------- Identity / state ----------

export function useSleeperUser(username: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "user", username],
    queryFn: () => getUserByUsername(username!),
    enabled: !!username,
    staleTime: 1 * HOUR,
  });
}

export function useNFLState() {
  return useQuery({
    queryKey: ["sleeper", "nflState"],
    queryFn: getNFLState,
    staleTime: 5 * MINUTE,
  });
}

export function useUserLeagues(userId: string | undefined, season: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "userLeagues", userId, season],
    queryFn: () => getUserLeagues(userId!, season!),
    enabled: !!userId && !!season,
    staleTime: 1 * HOUR,
  });
}

export function useLeague(leagueId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "league", leagueId],
    queryFn: () => getLeague(leagueId!),
    enabled: !!leagueId,
    staleTime: 1 * HOUR,
  });
}

export function useRosters(leagueId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "rosters", leagueId],
    queryFn: () => getRosters(leagueId!),
    enabled: !!leagueId,
    staleTime: 15 * MINUTE,
  });
}

export function useLeagueUsers(leagueId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "leagueUsers", leagueId],
    queryFn: () => getLeagueUsers(leagueId!),
    enabled: !!leagueId,
    staleTime: 1 * HOUR,
  });
}

export function useLeagueDrafts(leagueId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "leagueDrafts", leagueId],
    queryFn: () => getLeagueDrafts(leagueId!),
    enabled: !!leagueId,
    staleTime: 1 * HOUR,
  });
}

export function useDraft(draftId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "draft", draftId],
    queryFn: () => getDraft(draftId!),
    enabled: !!draftId,
    staleTime: 15 * MINUTE,
  });
}

export function useDraftPicks(draftId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "draftPicks", draftId],
    queryFn: () => getDraftPicks(draftId!),
    enabled: !!draftId,
    staleTime: 1 * HOUR,
  });
}

export function useTradedPicks(leagueId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "tradedPicks", leagueId],
    queryFn: () => getTradedPicks(leagueId!),
    enabled: !!leagueId,
    staleTime: 15 * MINUTE,
  });
}

export function usePlayers() {
  return useQuery({
    queryKey: ["sleeper", "players"],
    queryFn: getPlayers,
    staleTime: 1 * DAY,
    gcTime: 7 * DAY,
  });
}

export function useFCRanks() {
  return useQuery({
    queryKey: ["fc", "ranks"],
    queryFn: getFCRanks,
    staleTime: 15 * MINUTE,
  });
}

export function useWinnersBracket(leagueId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "winnersBracket", leagueId],
    queryFn: () => getWinnersBracket(leagueId!),
    enabled: !!leagueId,
    staleTime: 1 * HOUR,
  });
}

export function useLosersBracket(leagueId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "losersBracket", leagueId],
    queryFn: () => getLosersBracket(leagueId!),
    enabled: !!leagueId,
    staleTime: 1 * HOUR,
  });
}

export function useMatchupsByWeek(
  leagueId: string | undefined,
  weeks: number[] | undefined,
) {
  return useQueries({
    queries: (weeks ?? []).map((w) => ({
      queryKey: ["sleeper", "matchups", leagueId, w],
      queryFn: () => getMatchups(leagueId!, w),
      enabled: !!leagueId && weeks != null,
      staleTime: 5 * MINUTE,
    })),
  });
}

// ---------- Composite: walk the previous_league_id chain ----------

const MAX_CHAIN_DEPTH = 5;

/**
 * Walks the previous_league_id chain (oldest-first) and returns the picks for
 * each season's draft. This is what `buildKeeperHistory` consumes to compute
 * consecutive-keep cost escalation.
 */
export function useLeagueChainDraftPicks(rootLeagueId: string | undefined) {
  return useQuery({
    queryKey: ["sleeper", "chainPicks", rootLeagueId],
    queryFn: async () => {
      const seasonDrafts: DraftPick[][] = [];
      let cursor: string | undefined = rootLeagueId!;
      let depth = 0;
      while (cursor && depth < MAX_CHAIN_DEPTH) {
        try {
          const drafts = await getLeagueDrafts(cursor);
          if (drafts.length) {
            const picks = await getDraftPicks(drafts[0].draft_id);
            seasonDrafts.unshift(picks);
          }
          const lg = await getLeague(cursor);
          cursor = lg.previous_league_id;
        } catch {
          cursor = undefined;
        }
        depth += 1;
      }
      return seasonDrafts;
    },
    enabled: !!rootLeagueId,
    staleTime: 1 * HOUR,
  });
}
