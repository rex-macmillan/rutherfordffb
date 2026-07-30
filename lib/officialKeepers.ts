/**
 * Official keeper declarations from Sleeper (roster.keepers).
 *
 * These are what managers lock in on Sleeper before the draft — not the
 * what-if scenarios saved in localStorage on this site.
 */

import type { Roster } from "./sleeperApi";

/** playerId[] per rosterId for teams that have set keepers in Sleeper. */
export function officialKeepersByRoster(
  rosters: Roster[] | undefined,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (!rosters) return out;
  for (const r of rosters) {
    if (Array.isArray(r.keepers)) {
      out.set(r.roster_id, r.keepers);
    }
  }
  return out;
}

/**
 * True once every roster has a `keepers` array in Sleeper (including []).
 * Until then, official declarations stay hidden league-wide.
 */
export function allTeamsSubmittedOfficialKeepers(
  rosters: Roster[] | undefined,
  teamCount: number,
): boolean {
  if (!rosters || teamCount <= 0) return false;
  if (rosters.length < teamCount) return false;
  return rosters.every((r) => Array.isArray(r.keepers));
}

export function officialKeeperCount(
  rosters: Roster[] | undefined,
  rosterId: number,
): number | null {
  const map = officialKeepersByRoster(rosters);
  if (!map.has(rosterId)) return null;
  return map.get(rosterId)?.length ?? 0;
}
