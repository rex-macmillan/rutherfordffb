/**
 * Resolves the signed-in identity to the league the whole app renders.
 *
 * Split out of leagueHooks.ts so that modules leagueHooks itself depends on
 * (lib/draftOrder.ts) can use it without an import cycle. leagueHooks re-exports
 * both hooks, so existing `from "./leagueHooks"` imports keep working.
 */

import { League } from "./sleeperApi";
import { useIdentity } from "./identity";
import {
  useLeague,
  useNFLState,
  useSleeperUser,
  useUserLeagues,
} from "./sleeperQueries";

export interface CurrentLeagueResult {
  league?: League;
  season?: string;
  /** True when we fell back to a non-current season league (e.g. offseason). */
  isFallbackSeason: boolean;
  /** The season Sleeper claims is current (may not match `season`). */
  apiSeason?: string;
  isLoading: boolean;
  error?: Error | null;
}

/**
 * Resolves the identity username to a single league. If the user has multiple
 * leagues in the current season we just take the first.
 *
 * Offseason fallback: Sleeper flips `league_season` to the new year before
 * managers have re-created their leagues for that year. If the current-season
 * query returns an empty array, fall back to the previous season so the site
 * still has data to show. This is the dominant offseason use case — managers
 * planning the upcoming year's keepers based on the just-ended league.
 */
export function useCurrentLeague(): CurrentLeagueResult {
  const { username } = useIdentity();
  const userQ = useSleeperUser(username);
  const stateQ = useNFLState();

  const apiSeason = stateQ.data?.league_season;
  const prevApiSeason = (stateQ.data as any)?.previous_season as string | undefined;

  const currentQ = useUserLeagues(userQ.data?.user_id, apiSeason);
  const fallbackQ = useUserLeagues(
    userQ.data?.user_id,
    // Only resolve to a real value (i.e. fire the query) when current is known-empty.
    currentQ.data && currentQ.data.length === 0 ? prevApiSeason : undefined,
  );

  const usedFallback =
    !!currentQ.data && currentQ.data.length === 0 && !!fallbackQ.data?.length;
  const league = currentQ.data?.[0] ?? fallbackQ.data?.[0];
  const season = league?.season;

  const isLoading =
    userQ.isLoading ||
    stateQ.isLoading ||
    currentQ.isLoading ||
    // Only count the fallback as "loading" once it's actually enabled.
    (usedFallback ? false : fallbackQ.isFetching);
  const error =
    (userQ.error as Error | null) ??
    (stateQ.error as Error | null) ??
    (currentQ.error as Error | null) ??
    (fallbackQ.error as Error | null) ??
    null;

  return {
    league,
    season,
    apiSeason,
    isFallbackSeason: usedFallback,
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
