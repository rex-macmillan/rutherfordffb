import { describe, expect, it } from "vitest";
import {
  KEEPER_GRADE_ORDER,
  computeKeeperSurplus,
  describeKeeperValue,
  gradeKeeperSurplus,
  replacementValueAt,
} from "../keeperValue";
import { overallPickNumber } from "../draftSlots";

/**
 * A realistic value curve, interpolated from real FantasyCalc anchor points
 * (12-team / 1QB / PPR redraft, July 2026). Hardcoded rather than fetched so
 * the tests are deterministic and offline — the SHAPE is what matters: steeply
 * convex at the top, nearly flat after ~pick 100.
 */
const ANCHORS: Array<[number, number]> = [
  [1, 10463],
  [2, 10317],
  [3, 10050],
  [5, 8719],
  [8, 8321],
  [10, 8103],
  [12, 7731],
  [13, 7717],
  [15, 7362],
  [20, 6291],
  [24, 5618],
  [25, 5205],
  [30, 4369],
  [36, 4001],
  [40, 3774],
  [48, 3291],
  [60, 2383],
  [72, 1701],
  [84, 1351],
  [96, 1026],
  [100, 922],
  [108, 706],
  [120, 486],
  [132, 354],
  [144, 241],
  [156, 166],
  [168, 102],
  [180, 40],
  [199, 3],
];

function buildCurve(): number[] {
  const out: number[] = [];
  for (let rank = 1; rank <= 199; rank++) {
    const exact = ANCHORS.find(([r]) => r === rank);
    if (exact) {
      out.push(exact[1]);
      continue;
    }
    const lo = [...ANCHORS].reverse().find(([r]) => r < rank)!;
    const hi = ANCHORS.find(([r]) => r > rank)!;
    const t = (rank - lo[0]) / (hi[0] - lo[0]);
    out.push(Math.round(lo[1] + t * (hi[1] - lo[1])));
  }
  return out;
}

const CURVE = buildCurve();
const TOP = CURVE[0];
const TEAMS = 12;

/** Surplus for keeping the player at `rank` for `round`, given a draft slot. */
function surplusFor(rank: number, round: number, slot: number) {
  return computeKeeperSurplus({
    playerValue: CURVE[rank - 1],
    playerRank: rank,
    pickSlot: overallPickNumber(round, slot, TEAMS),
    valueCurve: CURVE,
  })!;
}

describe("replacementValueAt", () => {
  it("returns the Nth best player's value at pick N", () => {
    expect(replacementValueAt(1, CURVE)).toBe(CURVE[0]);
    expect(replacementValueAt(13, CURVE)).toBe(CURVE[12]);
  });

  it("shifts everyone up when the kept player is removed from the pool", () => {
    // Keeping the #1 overall: at pick 1 the real alternative is #2, not #1.
    expect(replacementValueAt(1, CURVE, 1)).toBe(CURVE[1]);
    // A player ranked below the pick doesn't affect that pick's replacement.
    expect(replacementValueAt(5, CURVE, 96)).toBe(CURVE[4]);
  });

  it("treats picks past the end of the ranked pool as worthless", () => {
    expect(replacementValueAt(5000, CURVE)).toBe(0);
  });
});

describe("computeKeeperSurplus", () => {
  it("is null when the player is unranked or the pick slot is unknown", () => {
    expect(
      computeKeeperSurplus({
        playerValue: null,
        playerRank: 1,
        pickSlot: 1,
        valueCurve: CURVE,
      }),
    ).toBeNull();
    expect(
      computeKeeperSurplus({
        playerValue: 100,
        playerRank: 1,
        pickSlot: null,
        valueCurve: CURVE,
      }),
    ).toBeNull();
  });

  /**
   * The bug that motivated this model: the old round-arithmetic scored the
   * consensus #1 overall at exactly 0 whenever his keeper cost matched his
   * market round, and could not tell a 1.01 keeper from a 1.12 one.
   */
  it("separates a 1.01 keeper of the #1 overall from a 1.12 keeper", () => {
    const at101 = surplusFor(1, 1, 1);
    const at112 = surplusFor(1, 1, 12);

    // At 1.01 you could simply draft him, so surplus is small — but NOT zero,
    // because the true alternative is the #2 player.
    expect(at101).toBe(CURVE[0] - CURVE[1]);
    expect(at101).toBeGreaterThan(0);

    // At 1.12 keeping him is a large gain.
    expect(at112).toBeGreaterThan(at101 * 10);
  });

  /**
   * The ranking complaint: a consensus 8th-rounder kept for a 9th or 10th must
   * not beat getting the best player in the draft at a realistic 1st-round slot.
   */
  it("ranks an elite 1st-round keeper above a late-round bargain", () => {
    const eliteAt110 = surplusFor(1, 1, 10);
    const lateBargainFor9th = surplusFor(96, 9, 6);
    const lateBargainFor10th = surplusFor(96, 10, 6);

    expect(eliteAt110).toBeGreaterThan(lateBargainFor9th * 5);
    expect(eliteAt110).toBeGreaterThan(lateBargainFor10th * 5);
  });

  /**
   * The core reason rounds were the wrong unit: one round of draft capital is
   * worth many times more at the top of the draft than at the bottom, so the
   * old `keeperRound − marketRound` arithmetic mispriced late-round keepers.
   */
  it("prices one round of draft capital far higher early than late", () => {
    const earlyRound =
      replacementValueAt(1, CURVE) - replacementValueAt(1 + TEAMS, CURVE);
    const lateRound =
      replacementValueAt(97, CURVE) - replacementValueAt(97 + TEAMS, CURVE);
    expect(earlyRound).toBeGreaterThan(lateRound * 5);
  });

  it("goes negative when the keeper costs more than the player is worth", () => {
    // The 24th-ranked player kept for a 2nd-rounder (pick 19).
    expect(surplusFor(24, 2, 6)).toBeLessThan(0);
    // A faded name-brand player on a 1st-round keeper cost: the real mistake.
    expect(surplusFor(150, 1, 5)).toBeLessThan(surplusFor(24, 2, 6));
  });
});

describe("gradeKeeperSurplus", () => {
  it("returns null without a surplus or a normalizer", () => {
    expect(gradeKeeperSurplus(null, TOP)).toBeNull();
    expect(gradeKeeperSurplus(500, 0)).toBeNull();
  });

  it("buckets the motivating scenarios sensibly", () => {
    expect(gradeKeeperSurplus(surplusFor(8, 6, 6), TOP)!.id).toBe("elite");
    expect(gradeKeeperSurplus(surplusFor(1, 1, 12), TOP)!.id).toBe("strong");
    expect(gradeKeeperSurplus(surplusFor(1, 1, 1), TOP)!.id).toBe("fair");
    expect(gradeKeeperSurplus(surplusFor(24, 2, 6), TOP)!.id).toBe("rich");
    // A faded 1st-round cost is the case that should actually read as red.
    expect(gradeKeeperSurplus(surplusFor(150, 1, 5), TOP)!.id).toBe("overpay");
  });

  it("keeps a late-round bargain strictly below an elite 1st-round keeper", () => {
    const elite = gradeKeeperSurplus(surplusFor(1, 1, 10), TOP)!;
    const bargain = gradeKeeperSurplus(surplusFor(96, 10, 6), TOP)!;
    expect(KEEPER_GRADE_ORDER.indexOf(elite.id)).toBeLessThan(
      KEEPER_GRADE_ORDER.indexOf(bargain.id),
    );
  });

  it("treats a trivial negative deep in the draft as fair, not an overpay", () => {
    // −105 points against a 10463 top-of-board is noise.
    expect(gradeKeeperSurplus(-105, TOP)!.id).toBe("fair");
  });

  /**
   * The top of the market is nearly flat — #1 through #3 sit within 4% — so the
   * #3 player on a pick-2 keeper cost is a near-tie, not a mistake. Calling that
   * an overpay would be reading precision the source data doesn't have.
   */
  it("does not call a near-tie at the top of the board an overpay", () => {
    expect(gradeKeeperSurplus(surplusFor(3, 1, 2), TOP)!.id).toBe("fair");
  });
});

describe("describeKeeperValue", () => {
  it("explains the grade in round.pick terms", () => {
    const grade = gradeKeeperSurplus(surplusFor(1, 1, 12), TOP);
    expect(
      describeKeeperValue({
        grade,
        playerRank: 1,
        pickSlot: 12,
        teamCount: TEAMS,
      }),
    ).toBe("Strong value — costs your 1.12, market value ~1.01");
  });

  it("flags a provisional draft order", () => {
    const grade = gradeKeeperSurplus(surplusFor(1, 1, 12), TOP);
    expect(
      describeKeeperValue({
        grade,
        playerRank: 1,
        pickSlot: 12,
        teamCount: TEAMS,
        provisionalSlot: true,
      }),
    ).toContain("draft order not final yet");
  });

  it("returns nothing without a grade or a pick slot", () => {
    expect(
      describeKeeperValue({
        grade: null,
        playerRank: 1,
        pickSlot: 12,
        teamCount: TEAMS,
      }),
    ).toBeUndefined();
  });
});
