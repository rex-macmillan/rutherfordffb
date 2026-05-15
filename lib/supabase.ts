/**
 * Supabase client.
 *
 * Optional: if NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are
 * not set, `supabase` is `null` and callers must fall back to localStorage.
 *
 * See supabase/schema.sql for the table definitions this module expects.
 */

import { SupabaseClient, createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseEnabled = supabase !== null;
