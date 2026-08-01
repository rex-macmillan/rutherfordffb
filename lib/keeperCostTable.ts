/**
 * Single source of truth for the keeper round-cost table.
 *
 * Section 2 of keeper_league_rulebook.md is rendered from this data so the
 * code and the documented rules can never drift.
 */

export const MAX_DRAFT_ROUND = 17;

/** Free-agent pickup with no FAAB bid (or unknown acquisition). */
export const FREE_AGENT_KEEPER_ROUND = 10;

/** @deprecated Use FREE_AGENT_KEEPER_ROUND — kept for existing imports. */
export const UNDRAFTED_KEEPER_ROUND = FREE_AGENT_KEEPER_ROUND;

export type KeeperCostLabel = number | string;

export interface KeeperCostRow {
  draftedRound: KeeperCostLabel;
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
  { draftedRound: 14, keeperRound: 11 },
  { draftedRound: 15, keeperRound: 11 },
  { draftedRound: 16, keeperRound: 12 },
  { draftedRound: 17, keeperRound: 12 },
  { draftedRound: "Waiver FAAB > $50", keeperRound: 4 },
  { draftedRound: "Waiver FAAB $35 – $49", keeperRound: 5 },
  { draftedRound: "Waiver FAAB $20 – $34", keeperRound: 6 },
  { draftedRound: "Waiver FAAB $10 – $19", keeperRound: 7 },
  { draftedRound: "Waiver FAAB $5 – $9", keeperRound: 8 },
  { draftedRound: "Waiver FAAB $0 – $4", keeperRound: 9 },
  { draftedRound: "Free Agent", keeperRound: FREE_AGENT_KEEPER_ROUND },
];

/** FAAB tiers for waiver acquisitions (highest matching tier wins). */
export const FAAB_KEEPER_TIERS = [
  { min: 50, keeperRound: 4 },
  { min: 35, keeperRound: 5 },
  { min: 20, keeperRound: 6 },
  { min: 10, keeperRound: 7 },
  { min: 5, keeperRound: 8 },
  { min: 0, keeperRound: 9 },
] as const;

const ROUND_MAP: ReadonlyMap<number, number> = new Map(
  KEEPER_COST_TABLE.filter(
    (r): r is { draftedRound: number; keeperRound: number } =>
      typeof r.draftedRound === "number",
  ).map((r) => [r.draftedRound, r.keeperRound]),
);

/**
 * One application of the keeper cost mapping for a drafted round.
 *
 * - `null` / `undefined` means no draft round — use {@link calculateAcquisitionKeeperRound}.
 * - Rounds beyond the documented table fall through unchanged (defensive default).
 */
export function calculateKeeperRound(
  originalRound: number | null | undefined,
): number {
  if (originalRound == null) return FREE_AGENT_KEEPER_ROUND;
  return ROUND_MAP.get(originalRound) ?? originalRound;
}

/** Keeper round from a waiver FAAB bid amount. */
export function keeperRoundFromFaab(faabSpend: number): number {
  for (const tier of FAAB_KEEPER_TIERS) {
    if (faabSpend >= tier.min) return tier.keeperRound;
  }
  return FREE_AGENT_KEEPER_ROUND;
}

/**
 * Keeper round for a player's acquisition last season.
 *
 * Drafted players use the round table. Waiver adds with a known FAAB bid use
 * the FAAB tiers. Otherwise defaults to free agent (10th round).
 */
export function calculateAcquisitionKeeperRound(args: {
  draftRound: number | null | undefined;
  faabSpend?: number | null;
}): number {
  if (args.draftRound != null) {
    return calculateKeeperRound(args.draftRound);
  }
  if (args.faabSpend != null && args.faabSpend >= 0) {
    return keeperRoundFromFaab(args.faabSpend);
  }
  return FREE_AGENT_KEEPER_ROUND;
}
