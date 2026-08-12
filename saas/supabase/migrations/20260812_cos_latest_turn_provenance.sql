-- saas/supabase/migrations/20260812_cos_latest_turn_provenance.sql
--
-- Backing store for cos-primary's provenance record: one row per user, upserted on every turn,
-- read back when the next question asks where an answer came from. Missing this table is why the
-- route answered "I don't have a real provenance record" — the write and the read both threw and
-- were swallowed, so nothing surfaced as an error.
--
-- RLS is enabled with no policies by design: every access goes through the service-role client,
-- which bypasses RLS, so anything reaching this table on a user-scoped connection fails closed.

create table if not exists public.cos_latest_turn_provenance (
  user_id uuid primary key,
  assistant_content text not null,
  provenance jsonb not null,
  source text,
  updated_at timestamptz not null default now()
);

alter table public.cos_latest_turn_provenance enable row level security;

create index if not exists cos_latest_turn_provenance_updated_idx
  on public.cos_latest_turn_provenance (updated_at desc);
