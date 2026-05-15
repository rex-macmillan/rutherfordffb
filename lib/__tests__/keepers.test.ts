import { describe, expect, it } from "vitest";
import {
  KEEPER_COST_TABLE,
  UNDRAFTED_KEEPER_ROUND,
  calculateKeeperRound,
} from "../keeperCostTable";
import {
  DraftPickRecord,
  TradedPickRecord,
  assignKeeperSlots,
  buildKeeperCostMap,
  buildKeeperHistory,
  computeDraftDeltas,
  computeKeeperCost,
  missingByRosterFromDeltas,
} from "../keepers";

// ---------- §2 round mapping ----------

describe("calculateKeeperRound (§2)", () => {
  it("matches the documented mapping table exactly", () => {
    for (const row of KEEPER_COST_TABLE) {
      if (typeof row.draftedRound === "number") {
        expect(calculateKeeperRound(row.draftedRound)).toBe(row.keeperRound);
      }
    }
  });

  it("returns 6 for undrafted players (null / undefined)", () => {
    expect(calculateKeeperRound(null)).toBe(UNDRAFTED_KEEPER_ROUND);
    expect(calculateKeeperRound(undefined)).toBe(UNDRAFTED_KEEPER_ROUND);
  });
});

// ---------- §2 consecutive-keep escalation ----------

describe("buildKeeperHistory / computeKeeperCost (§2 escalation)", () => {
  const PLAYER = "p1";

  it("yields cost = mapping(base) when drafted normally and never kept", () => {
    const seasons: DraftPickRecord[][] = [
      [{ player_id: PLAYER, round: 5, is_keeper: false }], // base = R5
    ];
    const hist = buildKeeperHistory(seasons);
    expect(hist.get(PLAYER)).toEqual({ base: 5, streak: 0, lastKeeper: false });
    expect(computeKeeperCost(hist.get(PLAYER)!)).toBe(4); // R5 → R4
  });

  it("escalates one tier per consecutive keep", () => {
    // Year 1: drafted R5. Year 2: kept (1 streak). Year 3: kept (2 streak).
    const seasons: DraftPickRecord[][] = [
      [{ player_id: PLAYER, round: 5, is_keeper: false }],
      [{ player_id: PLAYER, round: 4, is_keeper: true }],
      [{ player_id: PLAYER, round: 3, is_keeper: true }],
    ];
    const hist = buildKeeperHistory(seasons);
    expect(hist.get(PLAYER)).toEqual({ base: 5, streak: 2, lastKeeper: true });
    // R5 → R4 → R3 → R2
    expect(computeKeeperCost(hist.get(PLAYER)!)).toBe(2);
  });

  it("resets the streak when the player goes through the draft again", () => {
    const seasons: DraftPickRecord[][] = [
      [{ player_id: PLAYER, round: 5, is_keeper: false }],
      [{ player_id: PLAYER, round: 4, is_keeper: true }],
      [{ player_id: PLAYER, round: 11, is_keeper: false }], // dropped & re-drafted
    ];
    const hist = buildKeeperHistory(seasons);
    expect(hist.get(PLAYER)).toEqual({ base: 11, streak: 0, lastKeeper: false });
    expect(computeKeeperCost(hist.get(PLAYER)!)).toBe(9); // R11 → R9
  });

  it("returns null for players with no non-keeper draft history", () => {
    const hist: Map<string, ReturnType<typeof buildKeeperHistory> extends Map<string, infer V> ? V : never> = new Map();
    hist.set(PLAYER, { base: null, streak: 0, lastKeeper: false });
    expect(computeKeeperCost(hist.get(PLAYER)!)).toBeNull();
  });

  it("buildKeeperCostMap skips players without a base round", () => {
    const seasons: DraftPickRecord[][] = [
      [{ player_id: "a", round: 3, is_keeper: false }],
      [{ player_id: "a", round: 2, is_keeper: true }],
    ];
    const hist = buildKeeperHistory(seasons);
    // Inject a player whose history is entirely keeper rows (no base) — should be excluded.
    hist.set("b", { base: null, streak: 0, lastKeeper: false });
    const costs = buildKeeperCostMap(hist);
    expect(costs.get("a")).toBe(1); // R3 → R2 → R1
    expect(costs.has("b")).toBe(false);
  });
});

// ---------- §3 duplicate-round tie-break + §6 slide-up ----------

describe("assignKeeperSlots", () => {
  it("uses cost directly when nothing collides", () => {
    const { slots } = assignKeeperSlots(
      [
        { playerId: "x", rosterId: 1, cost: 3 },
        { playerId: "y", rosterId: 1, cost: 7 },
      ],
      new Map(),
    );
    expect(slots.get("x")).toBe(3);
    expect(slots.get("y")).toBe(7);
  });

  it("§3: duplicate cost slides LATER (cheaper first)", () => {
    const { slots } = assignKeeperSlots(
      [
        { playerId: "x", rosterId: 1, cost: 4 },
        { playerId: "y", rosterId: 1, cost: 4 },
        { playerId: "z", rosterId: 1, cost: 4 },
      ],
      new Map(),
    );
    expect(slots.get("x")).toBe(4);
    expect(slots.get("y")).toBe(5);
    expect(slots.get("z")).toBe(6);
  });

  it("§6: missing-round slides EARLIER first", () => {
    // Team 1 traded away their R4. Keeper x costs R4 → should land in R3.
    const { slots } = assignKeeperSlots(
      [{ playerId: "x", rosterId: 1, cost: 4 }],
      new Map([[1, new Set([4])]]),
    );
    expect(slots.get("x")).toBe(3);
  });

  it("§6: documented multi-keeper example resolves correctly", () => {
    // Etienne (R3) already kept, R4 traded away, want to keep Olave (R4).
    // Olave should slide up to R2 (since R3 and R4 are gone).
    const { slots } = assignKeeperSlots(
      [
        { playerId: "etienne", rosterId: 1, cost: 3 },
        { playerId: "olave", rosterId: 1, cost: 4 },
      ],
      new Map([[1, new Set([4])]]),
    );
    expect(slots.get("etienne")).toBe(3);
    expect(slots.get("olave")).toBe(2);
  });

  it("§6: explicit placement overrides auto slide-up", () => {
    const { slots } = assignKeeperSlots(
      [{ playerId: "x", rosterId: 1, cost: 4, placement: 6 }],
      new Map([[1, new Set([4])]]),
    );
    expect(slots.get("x")).toBe(6);
  });

  it("falls back to later round when no earlier round is available", () => {
    // R1 already taken, R2 traded — keeper costing R2 should go to R3.
    const { slots } = assignKeeperSlots(
      [
        { playerId: "a", rosterId: 1, cost: 1 }, // takes R1
        { playerId: "b", rosterId: 1, cost: 2 }, // R2 missing, R1 taken → R3
      ],
      new Map([[1, new Set([2])]]),
    );
    expect(slots.get("a")).toBe(1);
    expect(slots.get("b")).toBe(3);
  });
});

// ---------- §6 draft-pick deltas ----------

describe("computeDraftDeltas", () => {
  it("returns the baseline (one pick per round) when no trades", () => {
    const deltas = computeDraftDeltas([1, 2], [], "2026", 3);
    expect(deltas.get(1)).toEqual({ extra: [], missing: [] });
    expect(deltas.get(2)).toEqual({ extra: [], missing: [] });
  });

  it("flags traded rounds as missing for the giver and extra for the taker", () => {
    const traded: TradedPickRecord[] = [
      { season: "2026", round: 4, roster_id: 1, owner_id: 2 },
    ];
    const deltas = computeDraftDeltas([1, 2], traded, "2026");
    expect(deltas.get(1)?.missing).toContain(4);
    expect(deltas.get(2)?.extra).toContain(4);
  });

  it("ignores trades from other seasons", () => {
    const traded: TradedPickRecord[] = [
      { season: "2025", round: 4, roster_id: 1, owner_id: 2 },
    ];
    const deltas = computeDraftDeltas([1, 2], traded, "2026");
    expect(deltas.get(1)?.missing).toEqual([]);
    expect(deltas.get(2)?.extra).toEqual([]);
  });

  it("missingByRosterFromDeltas extracts the right shape", () => {
    const deltas = new Map([
      [1, { extra: [3], missing: [4, 7] }],
      [2, { extra: [], missing: [] }],
    ]);
    const mapping = missingByRosterFromDeltas(deltas);
    expect(mapping.get(1)).toEqual(new Set([4, 7]));
    expect(mapping.get(2)).toEqual(new Set());
  });
});
