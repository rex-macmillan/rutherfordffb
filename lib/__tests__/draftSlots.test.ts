import { describe, expect, it } from "vitest";
import { resolveDraftSlotMap, selectionOrderSlotMap } from "../draftSlots";

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
