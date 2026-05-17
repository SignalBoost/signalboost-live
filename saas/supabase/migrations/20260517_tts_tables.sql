-- saas/supabase/migrations/20260517_tts_tables.sql
-- Run this in Supabase: SQL Editor → New query → paste → Run.
-- Then create the storage bucket per the comment at the bottom.

-- ============================================================
-- tts_usage: one row per generation. Enforces monthly per-user caps.
-- ============================================================
create table if not exists public.tts_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  characters  integer not null check (characters > 0),
  voice_id    text not null,
  model_id    text not null default 'eleven_multilingual_v2',
  cache_hit   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists tts_usage_user_month_idx
  on public.tts_usage (user_id, created_at desc);

alter table public.tts_usage enable row level security;

create policy "Users read own tts_usage"
  on public.tts_usage for select
  using (auth.uid() = user_id);

-- No INSERT policy for end users — inserts happen via service role
-- from the /api/tts route only.


-- ============================================================
-- tts_cache: dedupes identical generations so we don't re-bill
-- ElevenLabs for the same (text + voice + model) combo.
-- ============================================================
create table if not exists public.tts_cache (
  hash         text primary key,
  storage_key  text not null,
  characters   integer not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  hit_count    integer not null default 0
);

alter table public.tts_cache enable row level security;
-- No end-user policies; service role only.


-- ============================================================
-- STORAGE BUCKET — do this in the Supabase Storage UI:
--   1. Storage → New bucket
--   2. Name: tts-cache
--   3. Public: NO (private — must be off)
--   4. File size limit: 10 MB
--   5. Allowed MIME types: audio/mpeg
-- ============================================================
