import { describe, expect, it } from "vitest";
import {
  calculateAcquisitionKeeperRound,
  keeperRoundFromFaab,
} from "../keeperCostTable";

describe("keeperRoundFromFaab", () => {
  it("maps FAAB tiers per §2", () => {
    expect(keeperRoundFromFaab(75)).toBe(4);
    expect(keeperRoundFromFaab(50)).toBe(4);
    expect(keeperRoundFromFaab(49)).toBe(5);
    expect(keeperRoundFromFaab(34)).toBe(6);
    expect(keeperRoundFromFaab(20)).toBe(6);
    expect(keeperRoundFromFaab(19)).toBe(7);
    expect(keeperRoundFromFaab(10)).toBe(7);
    expect(keeperRoundFromFaab(9)).toBe(8);
    expect(keeperRoundFromFaab(5)).toBe(8);
    expect(keeperRoundFromFaab(4)).toBe(9);
    expect(keeperRoundFromFaab(0)).toBe(9);
  });
});

describe("calculateAcquisitionKeeperRound", () => {
  it("prefers draft round over FAAB when both exist", () => {
    expect(
      calculateAcquisitionKeeperRound({ draftRound: 12, faabSpend: 100 }),
    ).toBe(10);
  });

  it("uses FAAB tier when undrafted", () => {
    expect(
      calculateAcquisitionKeeperRound({ draftRound: null, faabSpend: 40 }),
    ).toBe(5);
  });

  it("defaults to free agent when no draft round or FAAB", () => {
    expect(calculateAcquisitionKeeperRound({ draftRound: null })).toBe(10);
  });
});
