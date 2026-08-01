import { describe, expect, it } from "vitest";
import {
  applySlotPick,
  availableSlots,
  defaultScenarioPicks,
  nextSelector,
  scenarioIsComplete,
  scenarioToSlotMap,
} from "../draftSlotScenario";

const selectionRows = [
  { selectionOrder: 1, rosterId: 44 },
  { selectionOrder: 2, rosterId: 33 },
  { selectionOrder: 3, rosterId: 22 },
  { selectionOrder: 4, rosterId: 11 },
];

describe("nextSelector", () => {
  it("returns the first unassigned team in selection order", () => {
    expect(nextSelector(selectionRows, [])).toBe(44);
    expect(
      nextSelector(selectionRows, [{ rosterId: 44, slot: 7 }]),
    ).toBe(33);
  });

  it("returns null when every team has a slot", () => {
    const picks = defaultScenarioPicks(selectionRows);
    expect(nextSelector(selectionRows, picks)).toBeNull();
  });
});

describe("availableSlots", () => {
  it("lists open slot numbers", () => {
    expect(availableSlots(4, [{ rosterId: 44, slot: 2 }])).toEqual([1, 3, 4]);
  });
});

describe("applySlotPick", () => {
  it("rejects duplicate roster or slot", () => {
    expect(() => applySlotPick([], 44, 1)).not.toThrow();
    expect(() => applySlotPick([{ rosterId: 44, slot: 1 }], 44, 2)).toThrow();
    expect(() => applySlotPick([{ rosterId: 44, slot: 1 }], 33, 1)).toThrow();
  });
});

describe("scenarioIsComplete", () => {
  it("is false until every roster has a unique slot", () => {
    expect(scenarioIsComplete([], [11, 22])).toBe(false);
    expect(
      scenarioIsComplete([{ rosterId: 11, slot: 1 }], [11, 22]),
    ).toBe(false);
    expect(
      scenarioIsComplete(
        [
          { rosterId: 11, slot: 1 },
          { rosterId: 22, slot: 2 },
        ],
        [11, 22],
      ),
    ).toBe(true);
  });
});

describe("defaultScenarioPicks", () => {
  it("maps selector order to matching slot numbers", () => {
    expect(scenarioToSlotMap(defaultScenarioPicks(selectionRows))).toEqual({
      "1": 44,
      "2": 33,
      "3": 22,
      "4": 11,
    });
  });
});
