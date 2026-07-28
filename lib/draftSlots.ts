/**
 * Pure helpers for deciding which slot→roster mapping the draft board renders.
 *
 * Kept free of React/hooks (like lib/keepers.ts) so it can be unit-tested
 * directly. The slot-selection order itself is computed by the
 * `useDraftSelectionOrder` hook in lib/draftOrder.ts.
 */

/**
 * Sleeper ALWAYS returns a populated `slot_to_roster_id`, so its presence says
 * nothing about whether the commissioner has actually set the order. The real
 * signal is `draft_order` being non-null, or the draft having started.
 */
export function draftOrderIsOfficial(
  draft: { draft_order?: unknown; status?: string } | null | undefined,
): boolean {
  if (!draft) return false;
  return (
    draft.draft_order != null ||
    draft.status === "drafting" ||
    draft.status === "complete"
  );
}

/**
 * Overall pick number for a round + draft slot. Snake drafts reverse direction
 * on even rounds, so slot 1 picks last in round 2; linear drafts never reverse.
 *
 * This is what lets the keeper value model tell a 1.01 keeper (pick 1) from a
 * 1.12 keeper (pick 12) — two very different transactions that a round number
 * alone cannot distinguish.
 */
export function overallPickNumber(
  round: number,
  slot: number,
  teamCount: number,
  snake = true,
): number {
  const posInRound = snake && round % 2 === 0 ? teamCount - slot + 1 : slot;
  return (round - 1) * teamCount + posInRound;
}

/** Invert a slot→roster map into roster→slot. */
export function rosterSlotMap(
  slotMap: Record<string, number>,
): Map<number, number> {
  const out = new Map<number, number>();
  Object.entries(slotMap).forEach(([slot, rid]) => {
    out.set(Number(rid), parseInt(slot, 10));
  });
  return out;
}

/**
 * Map a resolved selection order onto draft slots 1..N: the team that selects
 * first defaults to slot 1, the team that selects last to the final slot. This
 * is the provisional default the board shows before managers lock real slots.
 */
export function selectionOrderSlotMap(
  rows: { selectionOrder: number; rosterId: number }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  rows.forEach((r) => {
    out[String(r.selectionOrder)] = r.rosterId;
  });
  return out;
}

function coversAllRosters(
  slotMap: Record<string, number> | null | undefined,
  rosterIds: number[],
): boolean {
  if (!slotMap || rosterIds.length === 0) return false;
  const assigned = new Set(Object.values(slotMap).map((v) => Number(v)));
  return rosterIds.every((rid) => assigned.has(rid));
}

export type SlotMapSource = "sleeper" | "selection" | "roster";

export interface ResolvedSlotMap {
  /** slot number (as string key) -> rosterId */
  slotMap: Record<string, number>;
  /** false only when the full order is locked in Sleeper */
  provisional: boolean;
  source: SlotMapSource;
}

/**
 * Decide which slot→roster mapping the draft board should render.
 *
 * Important: Sleeper ALWAYS returns a populated `slot_to_roster_id`. Before the
 * commissioner sets the order it's just the identity map (slot N → roster N,
 * i.e. join order), so its mere presence is NOT a signal that the order is set.
 * The real signal — `orderIsOfficial` — comes from `draft_order` being non-null
 * (or the draft being underway/complete); the caller computes it.
 *
 * Precedence:
 *  1. Sleeper's slot_to_roster_id, but only once the order is OFFICIAL —
 *     authoritative.
 *  2. The slot-selection order (reverse standings) as the default — first
 *     selector shows in slot 1, last selector in the final slot. Provisional.
 *  3. Roster (join) order — last resort when the order isn't official and the
 *     selection order can't be computed (e.g. previous bracket incomplete).
 *     This is Sleeper's default slot map, falling back to a synthesized one.
 */
export function resolveDraftSlotMap(args: {
  sleeperSlotMap: Record<string, number> | null | undefined;
  orderIsOfficial: boolean;
  selectionRows: { selectionOrder: number; rosterId: number }[];
  rosterIds: number[];
}): ResolvedSlotMap {
  const { sleeperSlotMap, orderIsOfficial, selectionRows, rosterIds } = args;

  // 1. The commissioner has officially set the order — trust Sleeper.
  if (orderIsOfficial && coversAllRosters(sleeperSlotMap, rosterIds)) {
    return {
      slotMap: { ...(sleeperSlotMap as Record<string, number>) },
      provisional: false,
      source: "sleeper",
    };
  }

  // 2. Default to the slot-selection order (reverse standings).
  const selectionMap = selectionOrderSlotMap(selectionRows);
  if (
    coversAllRosters(selectionMap, rosterIds) &&
    Object.keys(selectionMap).length === rosterIds.length
  ) {
    return { slotMap: selectionMap, provisional: true, source: "selection" };
  }

  // 3. Last resort: Sleeper's default (identity / join-order) map, else synthesize it.
  if (coversAllRosters(sleeperSlotMap, rosterIds)) {
    return {
      slotMap: { ...(sleeperSlotMap as Record<string, number>) },
      provisional: true,
      source: "roster",
    };
  }
  const rosterMap: Record<string, number> = {};
  rosterIds.forEach((rid, idx) => {
    rosterMap[String(idx + 1)] = rid;
  });
  return { slotMap: rosterMap, provisional: true, source: "roster" };
}
