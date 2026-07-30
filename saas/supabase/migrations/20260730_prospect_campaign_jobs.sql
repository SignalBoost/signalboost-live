-- saas/supabase/migrations/20260730_prospect_campaign_jobs.sql
--
-- BACKGROUND PROSPECT CAMPAIGNS.
--
-- A chat turn is a single bounded HTTP request: the Chief of Staff loop gives up at
-- 240 seconds. "Find ten companies, research each, draft outreach to each" is twenty
-- or more sequential model round trips, so it could never finish inside one turn no
-- matter how the prompt was written — the only possible outcome was the bounded-limit
-- message. This table is the missing piece: the chat turn writes a job row and returns
-- immediately, and a cron works through the prospects across many short invocations.
--
-- Nothing here sends anything. The worker's only output is rows in outreach_queue with
-- status 'pending', which still require the owner's approval and an explicit send in
-- the outreach console. The approval gate is unchanged.
--
-- Safe to run twice.

create table if not exists public.prospect_campaign_jobs (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid,
  status            text not null default 'queued',
  offer             text not null,
  target_criteria   text not null,
  region            text,
  language          text not null default 'en',
  requested_count   integer not null default 5,
  candidates        jsonb not null default '[]'::jsonb,
  results           jsonb not null default '[]'::jsonb,
  processed         integer not null default 0,
  drafts_created    integer not null default 0,
  skipped           integer not null default 0,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.prospect_campaign_jobs
  drop constraint if exists prospect_campaign_jobs_status_check;

alter table public.prospect_campaign_jobs
  add constraint prospect_campaign_jobs_status_check
  check (status in ('queued', 'discovering', 'running', 'completed', 'failed', 'cancelled'));

-- The worker claims the oldest unfinished job on every tick, so this is the hot path.
create index if not exists prospect_campaign_jobs_status_created_idx
  on public.prospect_campaign_jobs (status, created_at);

create index if not exists prospect_campaign_jobs_created_by_idx
  on public.prospect_campaign_jobs (created_by, created_at desc);

-- Service-role only, like the rest of the outreach tables: every read and write goes
-- through an owner-gated route or the CRON_SECRET-gated worker, never the browser.
alter table public.prospect_campaign_jobs enable row level security;
