-- Schema for shared league state.
--
-- The keeper site uses Sleeper usernames as identity (no real auth), so RLS
-- on these tables is intentionally permissive — anyone who knows the
-- league_id can read/write within it. This matches the "private friend
-- league" trust model and avoids the overhead of real auth.
--
-- If you want stricter rules later, swap to Supabase Auth + a `manager_user`
-- join table and tighten the policies below.

create table if not exists keeper_selections (
  league_id text not null,
  roster_id integer not null,
  player_ids text[] not null default '{}',
  slot_overrides jsonb not null default '{}'::jsonb,
  updated_by text,                              -- sleeper username
  updated_at timestamptz not null default now(),
  primary key (league_id, roster_id)
);

create index if not exists keeper_selections_league_idx
  on keeper_selections (league_id);

alter table keeper_selections enable row level security;

-- Permissive policy: anyone with the league_id can read/write.
drop policy if exists "league members read keeper_selections" on keeper_selections;
create policy "league members read keeper_selections"
  on keeper_selections for select using (true);

drop policy if exists "league members write keeper_selections" on keeper_selections;
create policy "league members write keeper_selections"
  on keeper_selections for insert with check (true);

drop policy if exists "league members update keeper_selections" on keeper_selections;
create policy "league members update keeper_selections"
  on keeper_selections for update using (true) with check (true);

drop policy if exists "league members delete keeper_selections" on keeper_selections;
create policy "league members delete keeper_selections"
  on keeper_selections for delete using (true);

-- ---------- Draft date poll ----------

create table if not exists draft_poll_responses (
  league_id          text not null,
  poll_id            text not null default '2026-draft',
  roster_id          integer not null,
  username           text,
  available_dates    text[] not null default '{}',
  unavailable_dates  text[] not null default '{}',
  slot_ids           text[] not null default '{}',  -- legacy broad buckets; unused
  notes              text,
  updated_at         timestamptz not null default now(),
  primary key (league_id, poll_id, roster_id)
);

-- If you created draft_poll_responses before per-date columns existed, run:
-- alter table draft_poll_responses add column if not exists available_dates text[] not null default '{}';
-- alter table draft_poll_responses add column if not exists unavailable_dates text[] not null default '{}';

create index if not exists draft_poll_responses_league_poll_idx
  on draft_poll_responses (league_id, poll_id);

alter table draft_poll_responses enable row level security;

drop policy if exists "league members read draft_poll_responses" on draft_poll_responses;
create policy "league members read draft_poll_responses"
  on draft_poll_responses for select using (true);

drop policy if exists "league members write draft_poll_responses" on draft_poll_responses;
create policy "league members write draft_poll_responses"
  on draft_poll_responses for insert with check (true);

drop policy if exists "league members update draft_poll_responses" on draft_poll_responses;
create policy "league members update draft_poll_responses"
  on draft_poll_responses for update using (true) with check (true);

drop policy if exists "league members delete draft_poll_responses" on draft_poll_responses;
create policy "league members delete draft_poll_responses"
  on draft_poll_responses for delete using (true);
