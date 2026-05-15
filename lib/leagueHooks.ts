/**
 * High-level composite hooks that page components consume directly.
 *
 * `useCurrentLeague()` resolves identity → user → leagues → first league.
 * `useKeeperHelperData()` fans out all the queries the Keeper Helper page
 *   needs and runs the pure derivation.
 */

import { useMemo } from "react";
import {
  League,
  LeagueUser,
  Roster,
  TradedPick,
} from "./sleeperApi";
import { useIdentity } from "./identity";
import {
  useDraftPicks,
  useFCRanks,
  useLeague,
  useLeagueChainDraftPicks,
  useLeagueDrafts,
  useLeagueUsers,
  useNFLState,
  usePlayers,
  useRosters,
  useSleeperUser,
  useTradedPicks,
  useUserLeagues,
} from "./sleeperQueries";
import { computeDraftDeltas } from "./keepers";
import { derivePlayerRows, DeriveResult, PlayerRow, TeamOption } from "./derivePlayerRows";

export interface CurrentLeagueResult {
  league?: League;
  season?: string;
  isLoading: boolean;
  error?: Error | null;
}

/**
 * Resolves the identity username to a single league. If the user has multiple
 * leagues in the current season we just take the first — same as today.
 */
export function useCurrentLeague(): CurrentLeagueResult {
  const { username } = useIdentity();
  const userQ = useSleeperUser(username);
  const stateQ = useNFLState();
  const leaguesQ = useUserLeagues(userQ.data?.user_id, stateQ.data?.league_season);

  const league = leaguesQ.data?.[0];
  const isLoading = userQ.isLoading || stateQ.isLoading || leaguesQ.isLoading;
  const error =
    (userQ.error as Error | null) ??
    (stateQ.error as Error | null) ??
    (leaguesQ.error as Error | null) ??
    null;

  return {
    league,
    season: stateQ.data?.league_season,
    isLoading,
    error,
  };
}

/**
 * For pages that need previous-league data (Keeper Helper, Draft Board).
 */
export function usePreviousLeague(currentLeague: League | undefined) {
  return useLeague(currentLeague?.previous_league_id);
}

export interface KeeperHelperData extends DeriveResult {
  deltas: ReturnType<typeof computeDraftDeltas>;
  currentRosters: Roster[];
  currentUsers: LeagueUser[];
  tradedPicks: TradedPick[];
}

/**
 * Pulls every piece of data the Keeper Helper page needs and runs the
 * derivation. Returns `data: undefined` until everything is ready.
 */
export function useKeeperHelperData(
  league: League | undefined,
  season: string | undefined,
): {
  data?: KeeperHelperData;
  isLoading: boolean;
  error: Error | null;
} {
  const prevLeagueId = league?.previous_league_id;

  const rostersQ = useRosters(league?.league_id);
  const usersQ = useLeagueUsers(league?.league_id);
  const tradedQ = useTradedPicks(league?.league_id);
  const playersQ = usePlayers();
  const fcQ = useFCRanks();

  const prevRostersQ = useRosters(prevLeagueId);
  const prevUsersQ = useLeagueUsers(prevLeagueId);
  const prevDraftsQ = useLeagueDrafts(prevLeagueId);
  const prevDraftPicksQ = useDraftPicks(prevDraftsQ.data?.[0]?.draft_id);

  const chainQ = useLeagueChainDraftPicks(prevLeagueId);

  const queries = [
    rostersQ,
    usersQ,
    tradedQ,
    playersQ,
    fcQ,
    prevRostersQ,
    prevUsersQ,
    prevDraftsQ,
    prevDraftPicksQ,
    chainQ,
  ];

  const isLoading = queries.some((q) => q.isLoading);
  const error =
    (queries.find((q) => q.error)?.error as Error | null | undefined) ?? null;

  const data = useMemo<KeeperHelperData | undefined>(() => {
    if (
      !league ||
      !season ||
      !rostersQ.data ||
      !usersQ.data ||
      !tradedQ.data ||
      !playersQ.data ||
      !fcQ.data ||
      !prevRostersQ.data ||
      !prevUsersQ.data ||
      !prevDraftPicksQ.data ||
      !chainQ.data
    )
      return undefined;

    const derived = derivePlayerRows({
      currentRosters: rostersQ.data,
      currentUsers: usersQ.data,
      previousRosters: prevRostersQ.data,
      previousUsers: prevUsersQ.data,
      previousDraftPicks: prevDraftPicksQ.data,
      chainDraftPicks: chainQ.data,
      players: playersQ.data,
      fcRanks: fcQ.data,
      tradedPicks: tradedQ.data,
      currentSeason: season,
    });

    const rosterIds = rostersQ.data.map((r) => r.roster_id);
    const deltas = computeDraftDeltas(rosterIds, tradedQ.data, season);

    return {
      ...derived,
      deltas,
      currentRosters: rostersQ.data,
      currentUsers: usersQ.data,
      tradedPicks: tradedQ.data,
    };
  }, [
    league,
    season,
    rostersQ.data,
    usersQ.data,
    tradedQ.data,
    playersQ.data,
    fcQ.data,
    prevRostersQ.data,
    prevUsersQ.data,
    prevDraftPicksQ.data,
    chainQ.data,
  ]);

  return { data, isLoading, error };
}

export type { PlayerRow, TeamOption };
