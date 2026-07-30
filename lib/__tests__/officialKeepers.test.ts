import { describe, expect, it } from "vitest";
import type { Roster } from "../sleeperApi";
import {
  allTeamsSubmittedOfficialKeepers,
  officialKeeperCount,
  officialKeepersByRoster,
} from "../officialKeepers";

function roster(id: number, keepers?: string[] | null): Roster {
  return {
    roster_id: id,
    owner_id: `user-${id}`,
    players: [],
    keepers,
  } as Roster;
}

describe("officialKeepersByRoster", () => {
  it("maps only rosters with an array keepers field", () => {
    const map = officialKeepersByRoster([
      roster(1, ["p1", "p2"]),
      roster(2, null),
      roster(3, undefined),
      roster(4, []),
    ]);
    expect(map.get(1)).toEqual(["p1", "p2"]);
    expect(map.get(4)).toEqual([]);
    expect(map.has(2)).toBe(false);
    expect(map.has(3)).toBe(false);
  });
});

describe("allTeamsSubmittedOfficialKeepers", () => {
  it("is false until every roster has keepers as an array", () => {
    expect(allTeamsSubmittedOfficialKeepers(undefined, 12)).toBe(false);
    expect(allTeamsSubmittedOfficialKeepers([roster(1, ["a"])], 12)).toBe(false);
    expect(
      allTeamsSubmittedOfficialKeepers(
        [roster(1, null), roster(2, [])],
        2,
      ),
    ).toBe(false);
    expect(
      allTeamsSubmittedOfficialKeepers(
        [roster(1, []), roster(2, ["x"])],
        2,
      ),
    ).toBe(true);
  });
});

describe("officialKeeperCount", () => {
  it("returns null when roster has not declared", () => {
    expect(officialKeeperCount([roster(1, null)], 1)).toBeNull();
  });

  it("returns count when declared", () => {
    expect(officialKeeperCount([roster(1, ["a", "b"])], 1)).toBe(2);
    expect(officialKeeperCount([roster(1, [])], 1)).toBe(0);
  });
});
