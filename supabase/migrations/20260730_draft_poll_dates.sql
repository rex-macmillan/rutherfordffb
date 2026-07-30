-- Run this in Supabase → SQL Editor if you already created draft_poll_responses
-- with the old slot_ids-only schema.

alter table draft_poll_responses
  add column if not exists available_dates text[] not null default '{}';

alter table draft_poll_responses
  add column if not exists unavailable_dates text[] not null default '{}';

-- Optional: clear old broad-bucket responses so everyone re-submits per-date.
-- delete from draft_poll_responses where poll_id = '2026-draft';
