/**
 * Mock draft slot selection — private what-if planning (localStorage).
 *
 * Managers pick a draft slot in §4 selection order. This module simulates
 * that process: one team at a time, assign them to an open slot 1..N.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { selectionOrderSlotMap } from "./draftSlots";

export interface SlotPick {
  rosterId: number;
  slot: number;
}

const LOCAL_KEY = (leagueId: string) => `draft-slot-scenario-${leagueId}`;

function readPicks(leagueId: string): SlotPick[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(LOCAL_KEY(leagueId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SlotPick =>
        p &&
        typeof p.rosterId === "number" &&
        typeof p.slot === "number",
    );
  } catch {
    return [];
  }
}

function writePicks(leagueId: string, picks: SlotPick[]) {
  if (typeof window === "undefined") return;
  if (picks.length === 0) {
    window.localStorage.removeItem(LOCAL_KEY(leagueId));
  } else {
    window.localStorage.setItem(LOCAL_KEY(leagueId), JSON.stringify(picks));
  }
}

/** slot number (string key) → rosterId */
export function scenarioToSlotMap(picks: SlotPick[]): Record<string, number> {
  const out: Record<string, number> = {};
  picks.forEach((p) => {
    out[String(p.slot)] = p.rosterId;
  });
  return out;
}

export function scenarioIsComplete(
  picks: SlotPick[],
  rosterIds: number[],
): boolean {
  if (rosterIds.length === 0) return false;
  if (picks.length !== rosterIds.length) return false;
  const assignedRosters = new Set(picks.map((p) => p.rosterId));
  const assignedSlots = new Set(picks.map((p) => p.slot));
  if (assignedSlots.size !== picks.length) return false;
  return rosterIds.every((rid) => assignedRosters.has(rid));
}

/** Who picks next, following selectionOrder ascending. */
export function nextSelector(
  selectionRows: { selectionOrder: number; rosterId: number }[],
  picks: SlotPick[],
): number | null {
  const assigned = new Set(picks.map((p) => p.rosterId));
  const sorted = [...selectionRows].sort(
    (a, b) => a.selectionOrder - b.selectionOrder,
  );
  for (const row of sorted) {
    if (!assigned.has(row.rosterId)) return row.rosterId;
  }
  return null;
}

export function availableSlots(teamCount: number, picks: SlotPick[]): number[] {
  const taken = new Set(picks.map((p) => p.slot));
  return Array.from({ length: teamCount }, (_, i) => i + 1).filter(
    (s) => !taken.has(s),
  );
}

export function applySlotPick(
  picks: SlotPick[],
  rosterId: number,
  slot: number,
): SlotPick[] {
  if (picks.some((p) => p.rosterId === rosterId)) {
    throw new Error("Team already has a slot");
  }
  if (picks.some((p) => p.slot === slot)) {
    throw new Error("Slot already taken");
  }
  return [...picks, { rosterId, slot }];
}

/** Default provisional mapping: selector 1 → slot 1, etc. */
export function defaultScenarioPicks(
  selectionRows: { selectionOrder: number; rosterId: number }[],
): SlotPick[] {
  const map = selectionOrderSlotMap(selectionRows);
  return Object.entries(map).map(([slot, rosterId]) => ({
    slot: parseInt(slot, 10),
    rosterId,
  }));
}

export function useDraftSlotScenario(leagueId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery<SlotPick[]>({
    queryKey: ["leagueState", "draftSlotScenario", leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      return readPicks(leagueId);
    },
    enabled: !!leagueId,
    staleTime: 0,
  });

  const persist = useCallback(
    (picks: SlotPick[]) => {
      if (!leagueId) return;
      writePicks(leagueId, picks);
      qc.invalidateQueries({
        queryKey: ["leagueState", "draftSlotScenario", leagueId],
      });
    },
    [leagueId, qc],
  );

  const assignSlot = useCallback(
    (rosterId: number, slot: number) => {
      if (!leagueId) return;
      const next = applySlotPick(readPicks(leagueId), rosterId, slot);
      persist(next);
    },
    [leagueId, persist],
  );

  const undoLast = useCallback(() => {
    if (!leagueId) return;
    const current = readPicks(leagueId);
    if (current.length === 0) return;
    persist(current.slice(0, -1));
  }, [leagueId, persist]);

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  const autoFillDefault = useCallback(
    (selectionRows: { selectionOrder: number; rosterId: number }[]) => {
      persist(defaultScenarioPicks(selectionRows));
    },
    [persist],
  );

  return {
    picks: query.data ?? [],
    isLoading: query.isLoading,
    assignSlot,
    undoLast,
    clear,
    autoFillDefault,
  };
}
