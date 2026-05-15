/**
 * Keeper selections shared across the league.
 *
 * - When Supabase is configured, every manager's selections are stored in the
 *   `keeper_selections` table and visible to everyone in the league.
 * - When Supabase isn't configured, selections persist to localStorage only.
 *
 * The two modes have the same shape and the same React-facing hooks so pages
 * never branch on the storage backend.
 */

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isSupabaseEnabled, supabase } from "./supabase";

export interface RosterKeepers {
  rosterId: number;
  playerIds: string[];
  slotOverrides: Record<string, number>; // playerId -> round
  updatedBy?: string;
  updatedAt?: string;
}

const LOCAL_KEY = (leagueId: string) => `keepers-${leagueId}`;

// ---------- localStorage ----------

interface LocalShape {
  ids?: string[];
  slots?: Record<string, number>;
}

function readLocal(leagueId: string): { ids: string[]; slots: Record<string, number> } {
  if (typeof window === "undefined") return { ids: [], slots: {} };
  const raw = window.localStorage.getItem(LOCAL_KEY(leagueId));
  if (!raw) return { ids: [], slots: {} };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { ids: parsed as string[], slots: {} }; // legacy
    const obj = parsed as LocalShape;
    return { ids: obj.ids ?? [], slots: obj.slots ?? {} };
  } catch {
    return { ids: [], slots: {} };
  }
}

function writeLocal(leagueId: string, ids: string[], slots: Record<string, number>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY(leagueId), JSON.stringify({ ids, slots }));
}

function clearLocal(leagueId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_KEY(leagueId));
}

// ---------- Supabase ----------

async function fetchAllKeepers(leagueId: string): Promise<RosterKeepers[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("keeper_selections")
    .select("roster_id, player_ids, slot_overrides, updated_by, updated_at")
    .eq("league_id", leagueId);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    rosterId: r.roster_id,
    playerIds: r.player_ids ?? [],
    slotOverrides: r.slot_overrides ?? {},
    updatedBy: r.updated_by ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  }));
}

async function upsertKeepers(
  leagueId: string,
  rosterId: number,
  playerIds: string[],
  slotOverrides: Record<string, number>,
  updatedBy: string | undefined,
) {
  if (!supabase) return;
  const { error } = await supabase.from("keeper_selections").upsert(
    {
      league_id: leagueId,
      roster_id: rosterId,
      player_ids: playerIds,
      slot_overrides: slotOverrides,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "league_id,roster_id" },
  );
  if (error) throw error;
}

async function deleteKeepers(leagueId: string, rosterId: number) {
  if (!supabase) return;
  const { error } = await supabase
    .from("keeper_selections")
    .delete()
    .eq("league_id", leagueId)
    .eq("roster_id", rosterId);
  if (error) throw error;
}

// ---------- React hook ----------

/**
 * League-wide keeper selections. Returns ALL rosters' selections when
 * Supabase is on, or just this device's selections when not.
 */
export function useLeagueKeepers(leagueId: string | undefined) {
  const qc = useQueryClient();

  // Read path.
  const query = useQuery<RosterKeepers[]>({
    queryKey: ["leagueState", "keepers", leagueId, isSupabaseEnabled],
    queryFn: async () => {
      if (!leagueId) return [];
      if (isSupabaseEnabled) return fetchAllKeepers(leagueId);
      const local = readLocal(leagueId);
      // Without a roster context here, we expose local data as roster_id = -1
      // and let callers re-map. (Caller knows their own rosterId.)
      return [
        {
          rosterId: -1,
          playerIds: local.ids,
          slotOverrides: local.slots,
        },
      ];
    },
    enabled: !!leagueId,
    staleTime: 30_000,
  });

  // Write path.
  const save = useCallback(
    async (params: {
      rosterId: number;
      playerIds: string[];
      slotOverrides: Record<string, number>;
      updatedBy?: string;
    }) => {
      if (!leagueId) return;
      if (isSupabaseEnabled) {
        await upsertKeepers(
          leagueId,
          params.rosterId,
          params.playerIds,
          params.slotOverrides,
          params.updatedBy,
        );
      } else {
        writeLocal(leagueId, params.playerIds, params.slotOverrides);
      }
      qc.invalidateQueries({ queryKey: ["leagueState", "keepers", leagueId] });
    },
    [leagueId, qc],
  );

  const clear = useCallback(
    async (rosterId: number) => {
      if (!leagueId) return;
      if (isSupabaseEnabled) {
        await deleteKeepers(leagueId, rosterId);
      } else {
        clearLocal(leagueId);
      }
      qc.invalidateQueries({ queryKey: ["leagueState", "keepers", leagueId] });
    },
    [leagueId, qc],
  );

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    save,
    clear,
    isShared: isSupabaseEnabled,
  };
}

/**
 * Convenience: subset of league-wide keepers for one roster. Falls through to
 * localStorage when Supabase isn't on.
 */
export function useRosterKeepers(leagueId: string | undefined, rosterId: number | undefined) {
  const all = useLeagueKeepers(leagueId);
  const [mine, setMine] = useState<RosterKeepers | null>(null);

  useEffect(() => {
    if (!leagueId || rosterId == null) {
      setMine(null);
      return;
    }
    if (isSupabaseEnabled) {
      const found = all.data.find((r) => r.rosterId === rosterId);
      setMine(
        found ?? {
          rosterId,
          playerIds: [],
          slotOverrides: {},
        },
      );
    } else {
      // localStorage doesn't know rosterId, just use the only entry.
      const local = all.data[0];
      setMine({
        rosterId,
        playerIds: local?.playerIds ?? [],
        slotOverrides: local?.slotOverrides ?? {},
      });
    }
  }, [leagueId, rosterId, all.data]);

  return {
    keepers: mine,
    isLoading: all.isLoading,
    save: all.save,
    clear: all.clear,
    isShared: all.isShared,
    allRosters: all.data,
  };
}
