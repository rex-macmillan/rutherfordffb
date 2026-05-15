/**
 * Pure keeper math. No React, no fetching, no I/O.
 *
 * Everything in this module is deterministic and unit-testable.
 *
 * The three load-bearing rules (each section of the rulebook is cited):
 *  - §2 round cost mapping  → calculateKeeperRound (see keeperCostTable.ts)
 *  - §2 consecutive-keep escalation → buildKeeperHistory + computeKeeperCost
 *  - §3 + §6 slide-up rule → assignKeeperSlots
 *  - §6 draft-pick trading → computeDraftDeltas
 */

import {
  calculateKeeperRound,
  MAX_DRAFT_ROUND,
  UNDRAFTED_KEEPER_ROUND,
} from "./keeperCostTable";

// ---------- Types ----------

export interface DraftPickRecord {
  player_id: string;
  round: number;
  is_keeper?: boolean;
}

export interface TradedPickRecord {
  season: string;
  round: number;
  roster_id: number;       // original owner who lost the pick
  owner_id: number;        // new owner who gained the pick
}

export interface KeeperHistory {
  /** The last round in which the player was *drafted normally* (not kept). Null = never drafted. */
  base: number | null;
  /** How many consecutive times they were kept since `base`. */
  streak: number;
  /** Whether their most recent appearance was a keeper pick. */
  lastKeeper: boolean;
}

export interface KeeperCandidate {
  playerId: string;
  rosterId: number;
  /** The round cost computed by the rules (before any slide-up adjustment). */
  cost: number;
  /** Optional explicit placement (when the user has saved a slot override). */
  placement?: number;
}

export interface DraftDelta {
  /** Rounds the team gained via trade (relative to baseline of one pick per round). */
  extra: number[];
  /** Rounds the team is missing because they were traded away. */
  missing: number[];
}

// ---------- Re-export ----------
export { calculateKeeperRound, MAX_DRAFT_ROUND, UNDRAFTED_KEEPER_ROUND };

// ---------- History across seasons (§2 consecutive-keep escalation) ----------

/**
 * Aggregate a player's keeper history across an ordered list of past seasons.
 *
 * `seasonDrafts` MUST be oldest-first. Each element is the list of draft picks
 * for one season.
 */
export function buildKeeperHistory(
  seasonDrafts: DraftPickRecord[][],
): Map<string, KeeperHistory> {
  const infoMap = new Map<string, KeeperHistory>();
  for (const picks of seasonDrafts) {
    for (const pick of picks) {
      const curr =
        infoMap.get(pick.player_id) ??
        ({ base: null, streak: 0, lastKeeper: false } as KeeperHistory);
      if (curr.base === null) {
        if (!pick.is_keeper) {
          curr.base = pick.round;
          curr.streak = 0;
          curr.lastKeeper = false;
        }
      } else if (pick.is_keeper) {
        curr.streak += 1;
        curr.lastKeeper = true;
      } else {
        curr.base = pick.round;
        curr.streak = 0;
        curr.lastKeeper = false;
      }
      infoMap.set(pick.player_id, curr);
    }
  }
  return infoMap;
}

/**
 * Apply the round-mapping table once for the base draft and once for each
 * consecutive keep, per §2 of the rulebook.
 *
 * Returns null when the player has no draft history (caller should fall back
 * to the undrafted default).
 */
export function computeKeeperCost(history: KeeperHistory): number | null {
  if (history.base == null) return null;
  let cost = history.base;
  for (let i = 0; i < history.streak + 1; i++) {
    cost = calculateKeeperRound(cost);
  }
  return cost;
}

/**
 * Build a `playerId → keeper round` map from a history map.
 */
export function buildKeeperCostMap(
  history: Map<string, KeeperHistory>,
): Map<string, number> {
  const out = new Map<string, number>();
  history.forEach((h, pid) => {
    const cost = computeKeeperCost(h);
    if (cost != null) out.set(pid, cost);
  });
  return out;
}

// ---------- Slide-up slot assignment (§3 + §6) ----------

export interface SlotAssignment {
  /** Player → round actually consumed (may differ from `cost` due to slide-up). */
  slots: Map<string, number>;
}

/**
 * Assign each keeper a draft round, honoring §3 (duplicate-round tie-break,
 * later round) and §6 (slide-up to earlier round when the pick is missing).
 *
 * Order of operations matches the existing site:
 *  1. Sort by cost ascending so cheap rounds are allocated first.
 *  2. For each keeper:
 *      - If desired round is unavailable because it was *traded away*, try
 *        earlier rounds first (§6 slide-up). Fall back to later if no earlier
 *        round is open.
 *      - If desired round is unavailable because *another keeper already
 *        took it*, move later (§3 tie-break).
 *  3. Honor an explicit `placement` override on the candidate (saved slot).
 */
export function assignKeeperSlots(
  keepers: KeeperCandidate[],
  missingByRoster: Map<number, Set<number>>,
): SlotAssignment {
  const sorted = [...keepers].sort((a, b) => a.cost - b.cost);
  const taken = new Set<string>();
  const key = (rid: number, rd: number) => `${rid}-${rd}`;

  const slots = new Map<string, number>();

  for (const k of sorted) {
    const missing = missingByRoster.get(k.rosterId) ?? new Set<number>();
    const isUnavailable = (rd: number) =>
      taken.has(key(k.rosterId, rd)) || missing.has(rd);

    let desired = k.placement ?? k.cost;

    if (k.placement == null && isUnavailable(desired)) {
      const missingHere = missing.has(desired);

      if (missingHere) {
        // §6 slide-up: try earlier rounds first.
        let earlier = desired - 1;
        while (earlier >= 1 && isUnavailable(earlier)) earlier -= 1;
        if (earlier >= 1) {
          desired = earlier;
        } else {
          let later = desired + 1;
          while (isUnavailable(later)) later += 1;
          desired = later;
        }
      } else {
        // §3 duplicate-round: slide later.
        let later = desired + 1;
        while (isUnavailable(later)) later += 1;
        desired = later;
      }
    }

    slots.set(k.playerId, desired);
    taken.add(key(k.rosterId, desired));
  }
  return { slots };
}

// ---------- Draft-pick deltas (§6) ----------

/**
 * Convert the raw `traded_picks` array for the current season into a
 * per-team summary of extra and missing rounds. Baseline assumes one pick per
 * round per team.
 */
export function computeDraftDeltas(
  rosterIds: number[],
  tradedPicks: TradedPickRecord[],
  currentSeason: string,
  maxRound = MAX_DRAFT_ROUND,
): Map<number, DraftDelta> {
  // counts[rid][round] = picks this team holds in that round.
  const counts = new Map<number, Map<number, number>>();
  rosterIds.forEach((rid) => {
    const rounds = new Map<number, number>();
    for (let r = 1; r <= maxRound; r++) rounds.set(r, 1);
    counts.set(rid, rounds);
  });

  for (const tp of tradedPicks) {
    if (tp.season !== currentSeason) continue;
    const orig = counts.get(tp.roster_id);
    const next = counts.get(tp.owner_id);
    if (orig) orig.set(tp.round, (orig.get(tp.round) ?? 0) - 1);
    if (next) next.set(tp.round, (next.get(tp.round) ?? 0) + 1);
  }

  const out = new Map<number, DraftDelta>();
  counts.forEach((rounds, rid) => {
    const extra: number[] = [];
    const missing: number[] = [];
    rounds.forEach((cnt, rd) => {
      if (cnt > 1) for (let i = 0; i < cnt - 1; i++) extra.push(rd);
      else if (cnt === 0) missing.push(rd);
    });
    extra.sort((a, b) => a - b);
    missing.sort((a, b) => a - b);
    out.set(rid, { extra, missing });
  });
  return out;
}

/**
 * Helper: convert a delta map to the per-roster `Set<missing-round>` shape
 * that `assignKeeperSlots` expects.
 */
export function missingByRosterFromDeltas(
  deltas: Map<number, DraftDelta>,
): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  deltas.forEach((d, rid) => out.set(rid, new Set(d.missing)));
  return out;
}
