/**
 * Draft date poll responses — Supabase only.
 *
 * Unlike keeper selections, a poll only works when responses are shared
 * league-wide, so there is no localStorage fallback.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CURRENT_DRAFT_POLL_ID,
  normalizeDateChoices,
} from "./draftPollConfig";
import { isSupabaseEnabled, supabase } from "./supabase";

export interface DraftPollResponse {
  rosterId: number;
  username?: string;
  availableDates: string[];
  unavailableDates: string[];
  notes?: string;
  updatedAt?: string;
}

async function fetchPollResponses(
  leagueId: string,
  pollId: string,
): Promise<DraftPollResponse[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("draft_poll_responses")
    .select(
      "roster_id, username, available_dates, unavailable_dates, slot_ids, notes, updated_at",
    )
    .eq("league_id", leagueId)
    .eq("poll_id", pollId);
  if (error) throw error;
  return (data ?? []).map((r) => {
    // Legacy rows stored broad buckets in slot_ids before per-date poll.
    const available = r.available_dates?.length
      ? r.available_dates
      : (r.slot_ids ?? []);
    return {
      rosterId: r.roster_id,
      username: r.username ?? undefined,
      availableDates: available ?? [],
      unavailableDates: r.unavailable_dates ?? [],
      notes: r.notes ?? undefined,
      updatedAt: r.updated_at ?? undefined,
    };
  });
}

async function upsertPollResponse(
  leagueId: string,
  pollId: string,
  params: {
    rosterId: number;
    username?: string;
    availableDates: string[];
    unavailableDates: string[];
    notes?: string;
  },
) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { available, unavailable } = normalizeDateChoices(
    params.availableDates,
    params.unavailableDates,
  );
  const { error } = await supabase.from("draft_poll_responses").upsert(
    {
      league_id: leagueId,
      poll_id: pollId,
      roster_id: params.rosterId,
      username: params.username ?? null,
      available_dates: available,
      unavailable_dates: unavailable,
      slot_ids: [],
      notes: params.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "league_id,poll_id,roster_id" },
  );
  if (error) throw error;
}

export function useDraftPoll(leagueId: string | undefined) {
  const qc = useQueryClient();
  const pollId = CURRENT_DRAFT_POLL_ID;

  const query = useQuery<DraftPollResponse[]>({
    queryKey: ["leagueState", "draftPoll", leagueId, pollId],
    queryFn: () => fetchPollResponses(leagueId!, pollId),
    enabled: !!leagueId && isSupabaseEnabled,
    staleTime: 15_000,
  });

  const save = useCallback(
    async (params: {
      rosterId: number;
      username?: string;
      availableDates: string[];
      unavailableDates: string[];
      notes?: string;
    }) => {
      if (!leagueId) return;
      await upsertPollResponse(leagueId, pollId, params);
      qc.invalidateQueries({ queryKey: ["leagueState", "draftPoll", leagueId] });
    },
    [leagueId, pollId, qc],
  );

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    save,
    isShared: isSupabaseEnabled,
    pollId,
  };
}
