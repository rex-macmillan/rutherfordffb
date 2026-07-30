/**
 * Keeper draft scenarios — private to this browser.
 *
 * What-if keeper sets for any roster, used to model the draft board. Not
 * shared across managers. Official Sleeper declarations are read separately
 * via lib/officialKeepers.ts and gated until everyone submits in Sleeper.
 *
 * Supabase is used for the draft date poll only (lib/pollState.ts).
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface RosterKeepers {
  rosterId: number;
  playerIds: string[];
  slotOverrides: Record<string, number>; // playerId -> round
  updatedBy?: string;
  updatedAt?: string;
}

const LOCAL_KEY = (leagueId: string) => `keeper-scenarios-${leagueId}`;

interface StoredRoster {
  playerIds: string[];
  slots: Record<string, number>;
}

type StoredScenarios = Record<string, StoredRoster>;

function readStore(leagueId: string): StoredScenarios {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(LOCAL_KEY(leagueId));
  if (!raw) return migrateLegacyStore(leagueId);
  try {
    return JSON.parse(raw) as StoredScenarios;
  } catch {
    return {};
  }
}

/** Previous key stored a single roster blob as rosterId -1. */
function migrateLegacyStore(leagueId: string): StoredScenarios {
  if (typeof window === "undefined") return {};
  const legacyKey = `keepers-${leagueId}`;
  const raw = window.localStorage.getItem(legacyKey);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : parsed?.ids ?? [];
    const slots = Array.isArray(parsed) ? {} : parsed?.slots ?? {};
    if (!ids.length) return {};
    const store: StoredScenarios = {
      "-1": { playerIds: ids as string[], slots },
    };
    writeStore(leagueId, store);
    window.localStorage.removeItem(legacyKey);
    return store;
  } catch {
    return {};
  }
}

function writeStore(leagueId: string, store: StoredScenarios) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY(leagueId), JSON.stringify(store));
}

function storeToEntries(store: StoredScenarios): RosterKeepers[] {
  return Object.entries(store).map(([rid, v]) => ({
    rosterId: Number(rid),
    playerIds: v.playerIds ?? [],
    slotOverrides: v.slots ?? {},
  }));
}

function upsertStoreRoster(
  store: StoredScenarios,
  rosterId: number,
  playerIds: string[],
  slots: Record<string, number>,
): StoredScenarios {
  const next = { ...store };
  if (playerIds.length === 0) {
    delete next[String(rosterId)];
  } else {
    next[String(rosterId)] = { playerIds, slots };
  }
  return next;
}

/**
 * All roster scenarios saved on this device for a league.
 */
export function useKeeperScenarios(leagueId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery<RosterKeepers[]>({
    queryKey: ["leagueState", "keeperScenarios", leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      return storeToEntries(readStore(leagueId));
    },
    enabled: !!leagueId,
    staleTime: 0,
  });

  const saveScenarios = useCallback(
    async (entries: RosterKeepers[]) => {
      if (!leagueId) return;
      const store: StoredScenarios = {};
      entries.forEach((e) => {
        if (e.playerIds.length === 0) return;
        store[String(e.rosterId)] = {
          playerIds: e.playerIds,
          slots: e.slotOverrides,
        };
      });
      writeStore(leagueId, store);
      qc.invalidateQueries({ queryKey: ["leagueState", "keeperScenarios", leagueId] });
    },
    [leagueId, qc],
  );

  const saveRoster = useCallback(
    async (params: {
      rosterId: number;
      playerIds: string[];
      slotOverrides: Record<string, number>;
    }) => {
      if (!leagueId) return;
      const store = upsertStoreRoster(
        readStore(leagueId),
        params.rosterId,
        params.playerIds,
        params.slotOverrides,
      );
      writeStore(leagueId, store);
      qc.invalidateQueries({ queryKey: ["leagueState", "keeperScenarios", leagueId] });
    },
    [leagueId, qc],
  );

  const clearRoster = useCallback(
    async (rosterId: number) => {
      if (!leagueId) return;
      const store = { ...readStore(leagueId) };
      delete store[String(rosterId)];
      writeStore(leagueId, store);
      qc.invalidateQueries({ queryKey: ["leagueState", "keeperScenarios", leagueId] });
    },
    [leagueId, qc],
  );

  const clearAll = useCallback(async () => {
    if (!leagueId) return;
    writeStore(leagueId, {});
    qc.invalidateQueries({ queryKey: ["leagueState", "keeperScenarios", leagueId] });
  }, [leagueId, qc]);

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    saveScenarios,
    saveRoster,
    clearRoster,
    clearAll,
  };
}

/** @deprecated Use useKeeperScenarios — name kept for minimal call-site churn. */
export function useLeagueKeepers(leagueId: string | undefined) {
  const s = useKeeperScenarios(leagueId);
  return {
    data: s.data,
    isLoading: s.isLoading,
    error: s.error,
    save: s.saveRoster,
    saveScenarios: s.saveScenarios,
    clear: s.clearRoster,
    clearAll: s.clearAll,
    isShared: false as const,
  };
}

export function useRosterKeepers(leagueId: string | undefined, rosterId: number | undefined) {
  const all = useKeeperScenarios(leagueId);
  const mine =
    rosterId != null
      ? all.data.find((r) => r.rosterId === rosterId) ?? {
          rosterId,
          playerIds: [],
          slotOverrides: {},
        }
      : null;

  return {
    keepers: mine,
    isLoading: all.isLoading,
    save: all.saveRoster,
    saveScenarios: all.saveScenarios,
    clear: all.clearRoster,
    clearAll: all.clearAll,
    isShared: false as const,
    allRosters: all.data,
  };
}
