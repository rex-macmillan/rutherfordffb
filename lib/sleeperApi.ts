/**
 * Raw fetch wrappers for the Sleeper public API + FantasyCalc.
 *
 * No caching here — TanStack Query handles dedup, retries, and stale-while-
 * revalidate in lib/sleeperQueries.ts.
 */

export const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";

// ---------- Types ----------

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name?: string;
  avatar?: string | null;
}

export interface NFLState {
  league_season: string; // e.g., "2026"
}

export interface League {
  league_id: string;
  season: string;
  previous_league_id?: string;
  draft_id: string;
  name: string;
  avatar?: string | null;
  settings?: Record<string, any>;
}

export interface Roster {
  roster_id: number;
  owner_id: string;
  players: string[];
  starters: string[];
  settings?: Record<string, any>;
}

export interface LeagueUser {
  user_id: string;
  display_name: string;
  avatar?: string | null;
  metadata?: { team_name?: string; avatar?: string };
}

export interface DraftPick {
  player_id: string;
  round: number;
  roster_id: number;
  pick_no: number;
  is_keeper?: boolean;
}

export interface TradedPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number;
}

export interface SleeperPlayer {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string;
  team?: string;
  fantasy_positions?: string[];
  years_exp?: number;
}

export type PlayersBlob = Record<string, SleeperPlayer>;

// ---------- Fetch helper ----------

async function sleeperJson<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${SLEEPER_BASE_URL}${endpoint}`);
  if (!res.ok) {
    throw new Error(`Sleeper API ${endpoint} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ---------- Endpoints ----------

export const getUserByUsername = (username: string) =>
  sleeperJson<SleeperUser>(`/user/${username}`);

export const getNFLState = () => sleeperJson<NFLState>(`/state/nfl`);

export const getUserLeagues = (userId: string, season: string, sport = "nfl") =>
  sleeperJson<League[]>(`/user/${userId}/leagues/${sport}/${season}`);

export const getLeague = (leagueId: string) =>
  sleeperJson<League>(`/league/${leagueId}`);

export const getRosters = (leagueId: string) =>
  sleeperJson<Roster[]>(`/league/${leagueId}/rosters`);

export const getLeagueUsers = (leagueId: string) =>
  sleeperJson<LeagueUser[]>(`/league/${leagueId}/users`);

export const getLeagueDrafts = (leagueId: string) =>
  sleeperJson<any[]>(`/league/${leagueId}/drafts`);

export const getDraft = (draftId: string) => sleeperJson<any>(`/draft/${draftId}`);

export const getDraftPicks = (draftId: string) =>
  sleeperJson<DraftPick[]>(`/draft/${draftId}/picks`);

export const getTradedPicks = (leagueId: string) =>
  sleeperJson<TradedPick[]>(`/league/${leagueId}/traded_picks`);

export const getPlayers = () => sleeperJson<PlayersBlob>(`/players/nfl`);

export const getWinnersBracket = (leagueId: string) =>
  sleeperJson<any[]>(`/league/${leagueId}/winners_bracket`);

export const getLosersBracket = (leagueId: string) =>
  sleeperJson<any[]>(`/league/${leagueId}/losers_bracket`);

export const getMatchups = (leagueId: string, week: number) =>
  sleeperJson<any[]>(`/league/${leagueId}/matchups/${week}`);

// ---------- FantasyCalc rankings (3rd-party) ----------

export interface FCPlayerResp {
  player: { sleeperId: string };
  overallRank: number;
}

const FC_URL =
  "https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams=12&ppr=1";

export async function getFCRanks(): Promise<Map<string, number>> {
  const res = await fetch(FC_URL);
  if (!res.ok) throw new Error(`FantasyCalc ranks ${res.status}`);
  const data: FCPlayerResp[] = await res.json();
  const map = new Map<string, number>();
  data.forEach((p) => {
    if (p.player?.sleeperId) map.set(p.player.sleeperId, p.overallRank);
  });
  return map;
}

// ---------- Avatars ----------

export const avatarThumbUrl = (avatarId: string | null | undefined) =>
  avatarId ? `https://sleepercdn.com/avatars/thumbs/${avatarId}` : null;

export const avatarFullUrl = (avatarId: string | null | undefined) =>
  avatarId ? `https://sleepercdn.com/avatars/${avatarId}` : null;
