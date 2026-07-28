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
import {
  CurrentLeagueResult,
  useCurrentLeague,
  usePreviousLeague,
} from "./currentLeague";
import {
  useDraftPicks,
  useFCData,
  useLeagueChainDraftPicks,
  useLeagueDrafts,
  useLeagueUsers,
  usePlayers,
  useRosters,
  useTradedPicks,
} from "./sleeperQueries";
import { useResolvedDraftSlots } from "./draftOrder";
import { computeDraftDeltas } from "./keepers";
import { derivePlayerRows, DeriveResult, PlayerRow, TeamOption } from "./derivePlayerRows";

export type { CurrentLeagueResult };
export { useCurrentLeague, usePreviousLeague };

export interface KeeperHelperData extends DeriveResult {
  deltas: ReturnType<typeof computeDraftDeltas>;
  currentRosters: Roster[];
  currentUsers: LeagueUser[];
  tradedPicks: TradedPick[];
}

/**
 * Match the signed-in Sleeper username to a roster in this league.
 * Returns undefined when the user doesn't own a roster here.
 */
export function findMyRosterId(
  users: LeagueUser[],
  rosters: Roster[],
  username: string | null | undefined,
): number | undefined {
  if (!username) return undefined;
  const owner = users.find(
    (u) =>
      u.display_name?.toLowerCase() === username.toLowerCase() ||
      u.metadata?.team_name?.toLowerCase() === username.toLowerCase(),
  );
  if (!owner) return undefined;
  return rosters.find((r) => r.owner_id === owner.user_id)?.roster_id;
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
  const fcQ = useFCData();
  const slots = useResolvedDraftSlots();

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
      fcRanks: fcQ.data.ranks,
      fcValues: fcQ.data.values,
      valueCurve: fcQ.data.valueCurve,
      draftSlotByRoster: slots.slotByRoster,
      slotsProvisional: slots.provisional,
      snakeDraft: slots.snake,
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
    slots.slotByRoster,
    slots.provisional,
    slots.snake,
  ]);

  return { data, isLoading, error };
}

export type { PlayerRow, TeamOption };
