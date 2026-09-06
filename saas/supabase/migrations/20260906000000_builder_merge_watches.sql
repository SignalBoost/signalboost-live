-- supabase/migrations/20260906000000_builder_merge_watches.sql
--
-- Durable post-merge deployment watch.
--
-- The in-request watch in lib/builder/repository-merge-watch.ts only has the seconds left in
-- the repair job, while a production build usually takes longer, so its common outcome is
-- "unresolved" — merged, not yet judged. This table is where that unresolved state waits so a
-- cron can finish the job minutes later instead of a human noticing.
--
-- WHY NOT builder_jobs.checkpoint. That rail exists but is closed to this work on purpose:
-- claim_builder_job_slice and pause_builder_job_slice both require
-- (metadata->>'platformRepair') = false, so repository-repair jobs cannot pause or resume.
-- Widening that predicate would reopen resume for the one job kind holding repository write
-- authority. A separate row with no execution authority is the smaller change.
--
-- Rows carry NO repair authority: a merge commit sha, a rollback target, and a counter. Nothing
-- here can start a repair, and the cron reads only these fields.

create table if not exists public.builder_merge_watches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  merge_commit_sha text not null check (merge_commit_sha ~ '^[0-9a-f]{7,40}$'),
  pre_merge_snapshot_id text not null check (length(pre_merge_snapshot_id) between 1 and 200),
  pull_request_number integer,
  -- Bounded so a deployment that never resolves stops costing cron time rather than retrying forever.
  attempts integer not null default 0 check (attempts between 0 and 3),
  status text not null default 'pending'
    check (status in ('pending', 'healthy', 'rolled_back', 'abandoned')),
  outcome_detail text,
  next_check_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live watch per merged commit. A repeated record for the same merge is a no-op, not a
-- second poller racing the first toward the same rollback.
create unique index if not exists builder_merge_watches_pending_commit
  on public.builder_merge_watches (merge_commit_sha) where status = 'pending';

create index if not exists builder_merge_watches_due
  on public.builder_merge_watches (next_check_at) where status = 'pending';

-- Service role only. No policies are defined, so RLS denies every anon and authenticated read.
alter table public.builder_merge_watches enable row level security;

-- Atomic lease: increment the attempt and push the next check out in the same statement that
-- hands the row over, so two overlapping cron ticks cannot both watch the same merge.
create or replace function public.claim_builder_merge_watches(p_limit integer, p_backoff_seconds integer)
returns setof public.builder_merge_watches
language sql security invoker set search_path = public, pg_temp as $$
  update public.builder_merge_watches w
  set attempts = w.attempts + 1,
      next_check_at = now() + make_interval(secs => greatest(p_backoff_seconds, 15)),
      updated_at = now()
  where w.id in (
    select id from public.builder_merge_watches
    where status = 'pending' and next_check_at <= now() and attempts < 3
    order by next_check_at asc
    limit greatest(least(p_limit, 5), 1)
    for update skip locked
  )
  returning w.*;
$$;

-- Terminal states are written once. A row that reached healthy, rolled_back or abandoned is
-- history and is never reopened by a later tick.
create or replace function public.close_builder_merge_watch(p_id uuid, p_status text, p_detail text)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_status not in ('healthy', 'rolled_back', 'abandoned') then
    raise exception 'builder_merge_watch_invalid_status';
  end if;
  update public.builder_merge_watches
  set status = p_status, outcome_detail = left(coalesce(p_detail, ''), 2000), updated_at = now()
  where id = p_id and status = 'pending';
  return found;
end;
$$;
