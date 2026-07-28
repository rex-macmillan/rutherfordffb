/**
 * Keeper value model. Pure — no React, no I/O.
 *
 * A keeper is worth what it saves you versus simply using the pick it costs:
 *
 *   surplus = value(player) − value(best player still on the board at that pick)
 *
 * Both terms are FantasyCalc redraft trade values for this exact league shape
 * (12-team, 1QB, PPR), so the non-linearity of the draft comes for free: value
 * falls ~229 points per pick across round 1 but only ~27 per pick in rounds
 * 8-10. Positional scarcity is priced in too, because the values are generated
 * for a 1QB league — there is no scarcity table to hand-tune.
 *
 * This replaced a model that measured surplus in ROUNDS (`keeperRound − market`,
 * times a tier weight). Two things were structurally wrong with it:
 *
 *  1. Rounds are ordinal, not a value scale, so a round saved in the 1st and a
 *     round saved in the 10th counted the same. Late-round "bargains" therefore
 *     outranked genuinely elite keepers.
 *  2. Any player priced at his own market round scored exactly zero, and the
 *     tier weight was a multiplier, so no amount of talent could rescue it —
 *     the consensus 1.01 graded the same as a replacement-level bench player.
 *
 * It also only knew the round, never the pick slot, so it could not tell a 1.01
 * keeper from a 1.12 keeper. Those are very different transactions: at 1.01 you
 * could just draft the guy, while at 1.12 keeping him is a large gain.
 */

/**
 * Value of the best player expected to be on the board at a given overall pick.
 *
 * At pick N roughly the top N−1 players are gone, so the best available is the
 * N-th best. `excludeRank` removes the player being evaluated from the pool —
 * he is yours, not draftable — which shifts everyone below him up one slot.
 * That is what keeps a 1.01 keeper of the consensus #1 from scoring exactly
 * zero: the real alternative is the #2 player, not the #1.
 *
 * Picks past the end of the ranked pool return 0, which is correct: a 15th
 * round keeper saves you nothing, because nothing of value is there anyway.
 */
export function replacementValueAt(
  pickSlot: number,
  valueCurve: number[],
  excludeRank?: number | null,
): number {
  const idx = Math.max(0, pickSlot - 1);
  const shifted =
    excludeRank != null && idx >= excludeRank - 1 ? idx + 1 : idx;
  return valueCurve[shifted] ?? 0;
}

export interface KeeperSurplusInput {
  /** FantasyCalc value of the player being kept. */
  playerValue: number | null;
  /** His overall rank, used to take him out of the draftable pool. */
  playerRank: number | null;
  /** Overall pick number his keeper cost consumes. */
  pickSlot: number | null;
  /** Every ranked player's value, descending. */
  valueCurve: number[];
}

/**
 * Surplus in FantasyCalc points. Positive means keeping beats drafting at that
 * slot. Returns null when the player is unranked or the pick slot is unknown.
 */
export function computeKeeperSurplus({
  playerValue,
  playerRank,
  pickSlot,
  valueCurve,
}: KeeperSurplusInput): number | null {
  if (playerValue == null || pickSlot == null) return null;
  if (!valueCurve.length) return null;
  return playerValue - replacementValueAt(pickSlot, valueCurve, playerRank);
}

export type KeeperGradeId =
  | "elite"
  | "strong"
  | "solid"
  | "edge"
  | "fair"
  | "rich"
  | "overpay";

export interface KeeperGrade {
  id: KeeperGradeId;
  label: string;
  /** Palette key the UI maps to Tailwind classes. */
  tone: "emerald" | "brand" | "ink" | "amber" | "red";
}

const GRADES: Record<KeeperGradeId, KeeperGrade> = {
  elite: { id: "elite", label: "Elite steal", tone: "emerald" },
  strong: { id: "strong", label: "Strong value", tone: "emerald" },
  solid: { id: "solid", label: "Solid value", tone: "brand" },
  edge: { id: "edge", label: "Slight edge", tone: "ink" },
  fair: { id: "fair", label: "Fair price", tone: "ink" },
  rich: { id: "rich", label: "A bit rich", tone: "amber" },
  overpay: { id: "overpay", label: "Overpay", tone: "red" },
};

/**
 * Grade cutoffs as a FRACTION of the #1 asset's value rather than absolute
 * points, so they survive FantasyCalc rescaling its point system and stay
 * meaningful across seasons where the top of the board is stronger or weaker.
 *
 * The neutral band is deliberately wide on the negative side. At the very top
 * of the board the market is nearly flat — the top three players are within 4%
 * of each other — so a small negative surplus for an elite player is inside the
 * noise of the source data, not a real mistake. "Overpay" is reserved for
 * keepers that are clearly wrong, which keeps the red meaningful in a table
 * where most rostered players are not viable keepers at all.
 */
const GRADE_BANDS: Array<[KeeperGradeId, number]> = [
  ["elite", 0.35],
  ["strong", 0.15],
  ["solid", 0.05],
  ["edge", 0.02],
  ["fair", -0.04],
  ["rich", -0.15],
];

/** Best to worst. Useful for sorting or comparing two grades. */
export const KEEPER_GRADE_ORDER: KeeperGradeId[] = [
  "elite",
  "strong",
  "solid",
  "edge",
  "fair",
  "rich",
  "overpay",
];

/**
 * Bucket a surplus into a grade. `topValue` is the value of the best player in
 * the pool (i.e. `valueCurve[0]`) and acts as the normalizer.
 */
export function gradeKeeperSurplus(
  surplus: number | null | undefined,
  topValue: number,
): KeeperGrade | null {
  if (surplus == null || !topValue) return null;
  const ratio = surplus / topValue;
  for (const [id, floor] of GRADE_BANDS) {
    if (ratio >= floor) return GRADES[id];
  }
  return GRADES.overpay;
}

/**
 * Human sentence for a tooltip. Deliberately talks in picks rather than points
 * — "costs your 1.12, market says 1.01" is legible in a way that "+2746" is not.
 */
export function describeKeeperValue(args: {
  grade: KeeperGrade | null;
  playerRank: number | null;
  pickSlot: number | null;
  teamCount: number;
  provisionalSlot?: boolean;
}): string | undefined {
  const { grade, playerRank, pickSlot, teamCount, provisionalSlot } = args;
  if (!grade || pickSlot == null || !teamCount) return undefined;
  const label = (pick: number) => {
    const round = Math.ceil(pick / teamCount);
    const inRound = pick - (round - 1) * teamCount;
    return `${round}.${String(inRound).padStart(2, "0")}`;
  };
  const parts = [`${grade.label} — costs your ${label(pickSlot)}`];
  if (playerRank != null) parts.push(`market value ~${label(playerRank)}`);
  if (provisionalSlot) parts.push("draft order not final yet");
  return parts.join(", ");
}
