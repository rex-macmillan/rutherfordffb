import { describe, expect, it } from "vitest";
import type { SleeperTransaction } from "../sleeperApi";
import {
  buildPlayerAcquisitionBasis,
  keeperRoundFromBasis,
} from "../playerAcquisition";

function tx(
  partial: Partial<SleeperTransaction> & Pick<SleeperTransaction, "type">,
): SleeperTransaction {
  return {
    transaction_id: "1",
    status: "complete",
    leg: 1,
    created: 1,
    ...partial,
  };
}

describe("buildPlayerAcquisitionBasis", () => {
  it("uses the most recent waiver bid after a drop", () => {
    const transactions: SleeperTransaction[] = [
      tx({
        leg: 1,
        created: 100,
        type: "waiver",
        adds: { p1: 1 },
        settings: { waiver_bid: 25 },
      }),
      tx({
        leg: 4,
        created: 200,
        type: "free_agent",
        drops: { p1: 1 },
      }),
      tx({
        leg: 7,
        created: 300,
        type: "waiver",
        adds: { p1: 2 },
        settings: { waiver_bid: 2 },
      }),
    ];

    const basis = buildPlayerAcquisitionBasis([], transactions);
    expect(basis.get("p1")).toEqual({ kind: "waiver", faab: 2 });
    expect(keeperRoundFromBasis(basis.get("p1"))).toBe(9); // $0–$4 tier
  });

  it("overwrites an earlier waiver when picked up again later", () => {
    const transactions: SleeperTransaction[] = [
      tx({
        leg: 3,
        created: 100,
        type: "waiver",
        adds: { p1: 1 },
        settings: { waiver_bid: 40 },
      }),
      tx({
        leg: 8,
        created: 200,
        type: "free_agent",
        drops: { p1: 1 },
      }),
      tx({
        leg: 12,
        created: 300,
        type: "waiver",
        adds: { p1: 3 },
        settings: { waiver_bid: 15 },
      }),
    ];

    const basis = buildPlayerAcquisitionBasis([], transactions);
    expect(basis.get("p1")).toEqual({ kind: "waiver", faab: 15 });
    expect(keeperRoundFromBasis(basis.get("p1"))).toBe(7);
  });

  it("keeps draft basis through a drop when re-acquired via trade", () => {
    const transactions: SleeperTransaction[] = [
      tx({ leg: 4, created: 200, type: "free_agent", drops: { p1: 1 } }),
      tx({ leg: 7, created: 300, type: "trade", adds: { p1: 2 } }),
    ];

    const basis = buildPlayerAcquisitionBasis(
      [{ player_id: "p1", round: 8, roster_id: 1, pick_no: 90 }],
      transactions,
    );
    expect(basis.get("p1")).toEqual({ kind: "draft", round: 8 });
    expect(keeperRoundFromBasis(basis.get("p1"))).toBe(6);
  });

  it("waiver re-acquisition overwrites draft basis after a drop", () => {
    const transactions: SleeperTransaction[] = [
      tx({ leg: 4, created: 200, type: "free_agent", drops: { p1: 1 } }),
      tx({
        leg: 7,
        created: 300,
        type: "waiver",
        adds: { p1: 2 },
        settings: { waiver_bid: 2 },
      }),
    ];

    const basis = buildPlayerAcquisitionBasis(
      [{ player_id: "p1", round: 5, roster_id: 1, pick_no: 50 }],
      transactions,
    );
    expect(basis.get("p1")).toEqual({ kind: "waiver", faab: 2 });
  });

  it("ignores failed waiver claims", () => {
    const transactions: SleeperTransaction[] = [
      tx({
        leg: 1,
        created: 100,
        type: "waiver",
        status: "failed",
        adds: { p1: 1 },
        settings: { waiver_bid: 99 },
      }),
      tx({
        leg: 2,
        created: 200,
        type: "free_agent",
        adds: { p1: 1 },
      }),
    ];

    const basis = buildPlayerAcquisitionBasis([], transactions);
    expect(basis.get("p1")).toEqual({ kind: "free_agent" });
  });
});
