import { describe, expect, it } from "vitest";
import { sortPlayerRows } from "../sortPlayerRows";

describe("sortPlayerRows", () => {
  const rows = [
    { name: "Charlie", pprRank: 30, keeperRound: 6 },
    { name: "Alice", pprRank: 5, keeperRound: 2 },
    { name: "Bob", pprRank: 12, keeperRound: 4 },
  ];

  it("sorts by name ascending", () => {
    const sorted = sortPlayerRows(rows, "name", true);
    expect(sorted.map((r) => r.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts by pprRank ascending", () => {
    const sorted = sortPlayerRows(rows, "pprRank", true);
    expect(sorted.map((r) => r.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("reverses when ascending is false", () => {
    const sorted = sortPlayerRows(rows, "name", false);
    expect(sorted.map((r) => r.name)).toEqual(["Charlie", "Bob", "Alice"]);
  });
});
