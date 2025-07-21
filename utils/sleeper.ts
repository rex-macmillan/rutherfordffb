export const SLEEPER_BASE_URL = "https://api.sleeper.app/v1";

// ---------- simple in-memory cache ----------
const responseCache = new Map<string, Promise<any>>();

async function cachedFetch<T>(endpoint: string): Promise<T> {
  if (responseCache.has(endpoint)) {
    return responseCache.get(endpoint) as Promise<T>;
  }
  const promise = fetch(`${SLEEPER_BASE_URL}${endpoint}`).then(async (res) => {
    if (!res.ok) throw new Error(`Sleeper API error ${res.status}: ${res.statusText}`);
    return res.json();
  });
  responseCache.set(endpoint, promise);
  return promise;
}

// existing sleeperFetch kept for non-cached or mutation calls
async function sleeperFetch<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${SLEEPER_BASE_URL}${endpoint}`);
  if (!res.ok) {
    throw new Error(`Sleeper API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Data types (partial)
export interface League {
  league_id: string;
  season: string;
  previous_league_id?: string;
  draft_id: string;
  name: string;
}

export interface Roster {
  roster_id: number;
  owner_id: string;
  players: string[];
  starters: string[];
}

export interface DraftPick {
  player_id: string;
  round: number;
  roster_id: number;
  pick_no: number;
  is_keeper?: boolean;
}

export interface LeagueUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string };
}

export interface SleeperPlayer {
  first_name?: string;
  last_name?: string;
  full_name?: string; // sometimes provided
  position?: string;
  team?: string; // NFL team abbreviation
  fantasy_positions?: string[];
}

// ------------------ New helper calls ------------------

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name?: string;
}

export interface NFLState {
  league_season: string; // e.g., "2024"
}

export async function getUserByUsername(username: string): Promise<SleeperUser> {
  return cachedFetch<SleeperUser>(`/user/${username}`);
}

export async function getNFLState(): Promise<NFLState> {
  return cachedFetch<NFLState>(`/state/nfl`);
}

export async function getUserLeagues(
  userId: string,
  season: string,
  sport: string = "nfl",
): Promise<League[]> {
  return cachedFetch<League[]>(`/user/${userId}/leagues/${sport}/${season}`);
}

export async function getLeague(leagueId: string): Promise<League> {
  return cachedFetch<League>(`/league/${leagueId}`);
}

export async function getRosters(leagueId: string): Promise<Roster[]> {
  return cachedFetch<Roster[]>(`/league/${leagueId}/rosters`);
}

export async function getLeagueDrafts(leagueId: string): Promise<any[]> {
  // This returns an array of draft objects (we only need id & season)
  return cachedFetch<any[]>(`/league/${leagueId}/drafts`);
}

export async function getLeagueUsers(
  leagueId: string,
): Promise<LeagueUser[]> {
  return cachedFetch<LeagueUser[]>(`/league/${leagueId}/users`);
}

let playersCache: Record<string, SleeperPlayer> | null = null;
export async function getPlayers(): Promise<Record<string, SleeperPlayer>> {
  if (playersCache) return playersCache;
  playersCache = await cachedFetch<Record<string, SleeperPlayer>>(`/players/nfl`);
  return playersCache;
}

// deprecated wrappers removed

export async function getDraftPicks(draftId: string): Promise<DraftPick[]> {
  return cachedFetch<DraftPick[]>(`/draft/${draftId}/picks`);
}

// Fetch full draft object (includes slot_to_roster_id / draft_order mapping)
export async function getDraft(draftId: string): Promise<any> {
  return cachedFetch<any>(`/draft/${draftId}`);
}

export async function getWinnersBracket(leagueId: string): Promise<any[]> {
  // season_type=playoff is default for winners
  return cachedFetch<any[]>(`/league/${leagueId}/winners_bracket`);
}

export async function getLosersBracket(leagueId: string): Promise<any[]> {
  return cachedFetch<any[]>(`/league/${leagueId}/losers_bracket`);
}

// Fetch matchups for a given week in a league (returns array of matchup objects)
export async function getMatchups(leagueId: string, week: number): Promise<any[]> {
  return cachedFetch<any[]>(`/league/${leagueId}/matchups/${week}`);
}

export function calculateKeeperRound(originalRound: number | null | undefined): number {
  // Mapping based on league's keeper rules
  const mapping: Record<number, number> = {
    1: 1,
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 6,
    8: 6,
    9: 7,
    10: 8,
    11: 9,
    12: 10,
    13: 10,
    14: 10,
    15: 11,
    16: 11,
    17: 11,
  };

  if (originalRound == null) return 6; // Undrafted players
  return mapping[originalRound] ?? originalRound; // fallback to same round if unmapped
}

export interface TradedPick {
  season: string;
  round: number;
  roster_id: number;
  owner_id: number;
  previous_owner_id: number;
}

export async function getTradedPicks(leagueId: string): Promise<TradedPick[]> {
  return cachedFetch<TradedPick[]>(`/league/${leagueId}/traded_picks`);
}

export interface FCPlayerResp {
  player: { sleeperId: string };
  overallRank: number;
}

export async function getFCRanks(): Promise<Map<string, number>> {
  const url =
    "https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams=12&ppr=1";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed FC ranks");
  const data: FCPlayerResp[] = await res.json();
  const map = new Map<string, number>();
  data.forEach((p) => {
    if (p.player?.sleeperId) map.set(p.player.sleeperId, p.overallRank);
  });
  return map;
} 