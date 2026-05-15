/**
 * Single source of truth for the keeper round-cost table.
 *
 * Section 2 of keeper_league_rulebook.md is rendered from this data so the
 * code and the documented rules can never drift.
 */

export const UNDRAFTED_KEEPER_ROUND = 6;
export const MAX_DRAFT_ROUND = 17;

export interface KeeperCostRow {
  draftedRound: number | "Undrafted";
  keeperRound: number;
}

export const KEEPER_COST_TABLE: ReadonlyArray<KeeperCostRow> = [
  { draftedRound: 1, keeperRound: 1 },
  { draftedRound: 2, keeperRound: 1 },
  { draftedRound: 3, keeperRound: 2 },
  { draftedRound: 4, keeperRound: 3 },
  { draftedRound: 5, keeperRound: 4 },
  { draftedRound: 6, keeperRound: 5 },
  { draftedRound: 7, keeperRound: 6 },
  { draftedRound: 8, keeperRound: 6 },
  { draftedRound: 9, keeperRound: 7 },
  { draftedRound: 10, keeperRound: 8 },
  { draftedRound: 11, keeperRound: 9 },
  { draftedRound: 12, keeperRound: 10 },
  { draftedRound: 13, keeperRound: 10 },
  { draftedRound: 14, keeperRound: 10 },
  { draftedRound: 15, keeperRound: 11 },
  { draftedRound: 16, keeperRound: 11 },
  { draftedRound: 17, keeperRound: 11 },
  { draftedRound: "Undrafted", keeperRound: UNDRAFTED_KEEPER_ROUND },
];

const ROUND_MAP: ReadonlyMap<number, number> = new Map(
  KEEPER_COST_TABLE.filter(
    (r): r is { draftedRound: number; keeperRound: number } =>
      typeof r.draftedRound === "number",
  ).map((r) => [r.draftedRound, r.keeperRound]),
);

/**
 * One application of the keeper cost mapping.
 *
 * - `null` / `undefined` means "undrafted last year" → 6th-round cost.
 * - Rounds beyond the documented table fall through unchanged (defensive
 *   default; should never happen in a normal Sleeper season).
 */
export function calculateKeeperRound(
  originalRound: number | null | undefined,
): number {
  if (originalRound == null) return UNDRAFTED_KEEPER_ROUND;
  return ROUND_MAP.get(originalRound) ?? originalRound;
}
