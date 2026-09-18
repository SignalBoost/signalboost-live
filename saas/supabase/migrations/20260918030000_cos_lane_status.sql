-- saas/supabase/migrations/20260918030000_cos_lane_status.sql
-- Current status of each autonomous lane, one row per lane.
--
-- A lane that stalls silently is expensive. The mass-distilled canary lane returns its skip reason as
-- JSON from the cron response, which nothing stores and a browser cannot read (the route requires a
-- CRON_SECRET bearer token, so opening it returns Unauthorized). On 2026-09-17 that cost three hours of
-- querying the assurance ledger for rows that never existed, and again tonight it made a working lane
-- look stalled while the wrong lane was investigated.
--
-- This is deliberately NOT the assurance ledger. That ledger is append-only evidence whose path ids are
-- REQUIRED by verifyLearningPathReceipts: declaring a lane there would mean an idle lane blocks
-- aggregate Production verification, and therefore graduation. Lane status is operational, not academic.
-- It is last-write-wins, one row per lane, never read by any gate, promotion or scoring decision.

create table if not exists public.cos_lane_status (
  lane text primary key,
  outcome text not null check (outcome in ('worked', 'skipped', 'failed')),
  reason text not null,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  deployment_id text,
  commit_sha text,
  consecutive_count integer not null default 1 check (consecutive_count >= 1),
  first_observed_at timestamptz not null default now(),
  observed_at timestamptz not null default now()
);

comment on table public.cos_lane_status is
  'Operational last-known status per autonomous lane. Last-write-wins, one row per lane. Never an input to any gate, promotion, scoring or verification decision -- see cos_university_learning_assurance_events for evidence.';

comment on column public.cos_lane_status.consecutive_count is
  'How many consecutive ticks have reported this same outcome+reason. A large count on a skipped lane is the signal that it is stalled rather than idle.';

comment on column public.cos_lane_status.commit_sha is
  'The deployed build that produced this status. Answers "is Production actually running the code I merged" without a Vercel lookup.';

alter table public.cos_lane_status enable row level security;
revoke all on public.cos_lane_status from anon, authenticated;
grant select, insert, update on public.cos_lane_status to service_role;

drop policy if exists cos_lane_status_service on public.cos_lane_status;
create policy cos_lane_status_service
  on public.cos_lane_status
  for all
  to service_role
  using (true)
  with check (true);

-- Collapse repeats into a count rather than a row per tick: a lane ticking every 2 minutes would
-- otherwise write 720 rows a day saying nothing changed. The count is what makes a stall legible.
create or replace function public.record_cos_lane_status(
  p_lane text,
  p_outcome text,
  p_reason text,
  p_detail jsonb,
  p_deployment_id text,
  p_commit_sha text
) returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  insert into public.cos_lane_status as target
    (lane, outcome, reason, detail, deployment_id, commit_sha, consecutive_count, first_observed_at, observed_at)
  values
    (p_lane, p_outcome, p_reason, coalesce(p_detail, '{}'::jsonb), p_deployment_id, p_commit_sha, 1, now(), now())
  on conflict (lane) do update set
    outcome = excluded.outcome,
    reason = excluded.reason,
    detail = excluded.detail,
    deployment_id = excluded.deployment_id,
    commit_sha = excluded.commit_sha,
    consecutive_count = case
      when target.outcome = excluded.outcome and target.reason = excluded.reason
        then target.consecutive_count + 1
      else 1
    end,
    first_observed_at = case
      when target.outcome = excluded.outcome and target.reason = excluded.reason
        then target.first_observed_at
      else now()
    end,
    observed_at = now();
end;
$$;

grant execute on function public.record_cos_lane_status(text, text, text, jsonb, text, text) to service_role;
