-- Operational lane status can now represent an active long-running canary without hiding the
-- previous completed outcome. This table remains observational only and is never an assurance input.

alter table public.cos_lane_status
  add column if not exists last_completed_outcome text,
  add column if not exists last_completed_reason text,
  add column if not exists last_completed_at timestamptz;

update public.cos_lane_status
set last_completed_outcome = outcome,
    last_completed_reason = reason,
    last_completed_at = observed_at
where outcome in ('worked','skipped','failed')
  and last_completed_outcome is null;

alter table public.cos_lane_status
  drop constraint if exists cos_lane_status_outcome_check;
alter table public.cos_lane_status
  add constraint cos_lane_status_outcome_check
  check (outcome in ('running','worked','skipped','failed'));

alter table public.cos_lane_status
  drop constraint if exists cos_lane_status_last_completed_outcome_check;
alter table public.cos_lane_status
  add constraint cos_lane_status_last_completed_outcome_check
  check (last_completed_outcome is null or last_completed_outcome in ('worked','skipped','failed'));

comment on column public.cos_lane_status.last_completed_outcome is
  'Most recent terminal lane outcome. Preserved while outcome=running so current activity does not erase the last completed result.';
comment on column public.cos_lane_status.last_completed_reason is
  'Reason associated with last_completed_outcome.';
comment on column public.cos_lane_status.last_completed_at is
  'Timestamp of the most recent terminal lane outcome.';

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
    (lane, outcome, reason, detail, deployment_id, commit_sha, consecutive_count, first_observed_at, observed_at,
     last_completed_outcome, last_completed_reason, last_completed_at)
  values
    (p_lane, p_outcome, p_reason, coalesce(p_detail, '{}'::jsonb), p_deployment_id, p_commit_sha, 1, now(), now(),
     case when p_outcome='running' then null else p_outcome end,
     case when p_outcome='running' then null else p_reason end,
     case when p_outcome='running' then null else now() end)
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
    observed_at = now(),
    last_completed_outcome = case
      when excluded.outcome='running'
        then coalesce(target.last_completed_outcome, case when target.outcome<>'running' then target.outcome end)
      else excluded.outcome
    end,
    last_completed_reason = case
      when excluded.outcome='running'
        then coalesce(target.last_completed_reason, case when target.outcome<>'running' then target.reason end)
      else excluded.reason
    end,
    last_completed_at = case
      when excluded.outcome='running'
        then coalesce(target.last_completed_at, case when target.outcome<>'running' then target.observed_at end)
      else now()
    end;
end;
$$;

grant execute on function public.record_cos_lane_status(text, text, text, jsonb, text, text) to service_role;
