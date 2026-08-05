-- saas/supabase/migrations/20260805_press_campaign_jobs.sql
--
-- BACKGROUND PRESS CAMPAIGNS.
--
-- Sales learned this in July; press never did. A chat turn is one bounded HTTP
-- request — the Chief of Staff loop is abandoned at 260 seconds. "Find thirty
-- publications and prepare a campaign for each" is a live web crawl followed by
-- thirty AI-written press releases, which is not a slow turn, it is a turn that
-- CANNOT finish. No prompt, no forced tool choice and no amount of patience makes
-- thirty model round trips fit in four minutes; the only possible outcome was the
-- bounded-limit message and an empty cockpit.
--
-- So the chat turn writes one row here and returns a job id immediately, and a cron
-- works through the outlets across many short invocations. Progress lives in the
-- database, not in an HTTP request that can die.
--
-- NOTHING HERE SENDS ANYTHING. The worker's only output is press_campaigns rows in
-- pending_owner_review, exactly as if the owner had filled the cockpit form by hand.
-- Every existing gate still applies — target validation, the paid-claim refusal, the
-- spend gate, owner approval. A background job changes WHEN the drafting happens, and
-- nothing about who authorises the sending.
--
-- Safe to run twice.

create table if not exists public.press_campaign_jobs (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid,
  status            text not null default 'queued',
  -- What the release should announce, in the owner's own words.
  goal              text not null,
  -- Where to look and what kind of outlet: 'digital_press', 'newspaper_print', etc.
  region            text,
  channel           text not null default 'digital_press',
  language          text not null default 'en',
  audience          text,
  cta_url           text,
  requested_count   integer not null default 10,
  -- Outlets discovered but not yet drafted. Consumed from the FRONT, never re-indexed
  -- by a cumulative counter — that collision is what wedged the prospect worker.
  candidates        jsonb not null default '[]'::jsonb,
  -- One entry per outlet the worker finished with, queued or skipped, with the reason.
  results           jsonb not null default '[]'::jsonb,
  processed         integer not null default 0,
  drafts_created    integer not null default 0,
  skipped           integer not null default 0,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.press_campaign_jobs
  drop constraint if exists press_campaign_jobs_status_check;

alter table public.press_campaign_jobs
  add constraint press_campaign_jobs_status_check
  check (status in ('queued', 'discovering', 'running', 'completed', 'failed', 'cancelled'));

-- The worker claims the oldest unfinished job on every tick, so this is the hot path.
create index if not exists press_campaign_jobs_status_created_idx
  on public.press_campaign_jobs (status, created_at);

create index if not exists press_campaign_jobs_created_by_idx
  on public.press_campaign_jobs (created_by, created_at desc);

-- Service-role only, like the rest of the outreach tables: every read and write goes
-- through an owner-gated route or the CRON_SECRET-gated worker, never the browser.
alter table public.press_campaign_jobs enable row level security;
