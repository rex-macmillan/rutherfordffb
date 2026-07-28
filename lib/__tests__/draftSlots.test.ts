import { describe, expect, it } from "vitest";
import {
  draftOrderIsOfficial,
  overallPickNumber,
  resolveDraftSlotMap,
  rosterSlotMap,
  selectionOrderSlotMap,
} from "../draftSlots";

const rosterIds = [11, 22, 33, 44];

// selectionOrder is "who picks their slot first" (1 = first selector).
// rosterId 44 finished worst, so it selects first, etc.
const selectionRows = [
  { selectionOrder: 1, rosterId: 44 },
  { selectionOrder: 2, rosterId: 33 },
  { selectionOrder: 3, rosterId: 22 },
  { selectionOrder: 4, rosterId: 11 },
];

describe("selectionOrderSlotMap", () => {
  it("maps the first selector to slot 1 and the last to the final slot", () => {
    expect(selectionOrderSlotMap(selectionRows)).toEqual({
      "1": 44,
      "2": 33,
      "3": 22,
      "4": 11,
    });
  });
});

describe("resolveDraftSlotMap", () => {
  it("uses Sleeper's order once it is official", () => {
    const sleeperSlotMap = { "1": 11, "2": 22, "3": 33, "4": 44 };
    const r = resolveDraftSlotMap({
      sleeperSlotMap,
      orderIsOfficial: true,
      selectionRows,
      rosterIds,
    });
    expect(r.source).toBe("sleeper");
    expect(r.provisional).toBe(false);
    expect(r.slotMap).toEqual(sleeperSlotMap);
  });

  it("defaults to selection order even though Sleeper returns a default (identity) slot map", () => {
    // The regression we caught: pre-draft, Sleeper fills slot_to_roster_id with
    // the identity/join map, but draft_order is null → not official.
    const identityMap = { "1": 11, "2": 22, "3": 33, "4": 44 };
    const r = resolveDraftSlotMap({
      sleeperSlotMap: identityMap,
      orderIsOfficial: false,
      selectionRows,
      rosterIds,
    });
    expect(r.source).toBe("selection");
    expect(r.provisional).toBe(true);
    expect(r.slotMap).toEqual({ "1": 44, "2": 33, "3": 22, "4": 11 });
  });

  it("falls back to Sleeper's default map when the order isn't official and the selection order is incomplete", () => {
    // Previous-season bracket only resolved two finishers.
    const identityMap = { "1": 11, "2": 22, "3": 33, "4": 44 };
    const r = resolveDraftSlotMap({
      sleeperSlotMap: identityMap,
      orderIsOfficial: false,
      selectionRows: selectionRows.slice(0, 2),
      rosterIds,
    });
    expect(r.source).toBe("roster");
    expect(r.provisional).toBe(true);
    expect(r.slotMap).toEqual(identityMap);
  });

  it("synthesizes roster order as the absolute last resort", () => {
    const r = resolveDraftSlotMap({
      sleeperSlotMap: {},
      orderIsOfficial: false,
      selectionRows: selectionRows.slice(0, 2),
      rosterIds,
    });
    expect(r.source).toBe("roster");
    expect(r.provisional).toBe(true);
    expect(r.slotMap).toEqual({ "1": 11, "2": 22, "3": 33, "4": 44 });
  });
});

describe("draftOrderIsOfficial", () => {
  it("is false when draft_order is null, even though slot_to_roster_id is filled", () => {
    expect(
      draftOrderIsOfficial({ draft_order: null, status: "pre_draft" }),
    ).toBe(false);
  });

  it("is true once draft_order is set or the draft has started", () => {
    expect(draftOrderIsOfficial({ draft_order: { "1": 11 } })).toBe(true);
    expect(draftOrderIsOfficial({ status: "drafting" })).toBe(true);
    expect(draftOrderIsOfficial({ status: "complete" })).toBe(true);
  });

  it("is false for missing data", () => {
    expect(draftOrderIsOfficial(undefined)).toBe(false);
  });
});

describe("overallPickNumber", () => {
  it("counts straight through in odd rounds", () => {
    expect(overallPickNumber(1, 1, 12)).toBe(1);
    expect(overallPickNumber(1, 12, 12)).toBe(12);
    expect(overallPickNumber(3, 1, 12)).toBe(25);
  });

  it("reverses in even rounds of a snake", () => {
    expect(overallPickNumber(2, 12, 12)).toBe(13);
    expect(overallPickNumber(2, 1, 12)).toBe(24);
  });

  it("never reverses in a linear draft", () => {
    expect(overallPickNumber(2, 1, 12, false)).toBe(13);
    expect(overallPickNumber(2, 12, 12, false)).toBe(24);
  });
});

describe("rosterSlotMap", () => {
  it("inverts slot→roster into roster→slot", () => {
    const m = rosterSlotMap({ "1": 44, "2": 33 });
    expect(m.get(44)).toBe(1);
    expect(m.get(33)).toBe(2);
  });
});
