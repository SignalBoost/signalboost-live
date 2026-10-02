-- Post-graduation Workforce pipeline: one evidence-derived state machine for every permanent graduate identity.
create table if not exists public.cos_workforce_evidence_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_kind text not null check (event_kind in ('serving_attempt')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','delivered','blocked')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists cos_workforce_evidence_outbox_pending_idx
  on public.cos_workforce_evidence_outbox(status,next_attempt_at,created_at);
alter table public.cos_workforce_evidence_outbox enable row level security;
revoke all on public.cos_workforce_evidence_outbox from public, anon, authenticated;

create or replace view public.cos_workforce_post_graduation_pipeline
with (security_invoker = true)
as
select
  g.id as registry_id,
  b.permanent_artifact_id as ai_id,
  g.candidate_id,
  g.subject_id,
  g.trained_artifact_hash,
  g.promoted_at as graduated_at,
  g.activated_at,
  w.hired_at,
  w.status as workforce_status,
  min(a.recorded_at) as first_attempt_at,
  max(a.recorded_at) as last_attempt_at,
  count(distinct a.attempt_id) as serving_attempts,
  count(distinct a.attempt_id) filter (where a.phase='attempt_succeeded') as successful_attempts,
  count(distinct a.attempt_id) filter (where a.phase='attempt_failed') as failed_attempts,
  count(distinct a.attempt_id) filter (where a.phase='fallback') as fallback_attempts,
  coalesce(v.verified_outcomes,0)::bigint as verified_outcomes,
  coalesce(v.remediation_events,0)::bigint as remediation_events,
  case
    when g.status <> 'active' then 'not_active'
    when w.status is distinct from 'on_call' then 'not_on_call'
    when count(distinct a.attempt_id)=0 then 'awaiting_dispatch'
    when count(distinct a.attempt_id) filter (where a.phase='attempt_succeeded')=0 then 'serving_unproven'
    when coalesce(v.verified_outcomes,0)=0 then 'served_awaiting_verification'
    else 'working_verified'
  end as pipeline_stage
from public.cos_university_graduate_model_registry g
join public.cos_university_artifact_birth_certificates b
  on b.candidate_id=g.candidate_id and b.trained_artifact_hash=g.trained_artifact_hash
left join public.cos_workforce_roster w on w.registry_id=g.id
left join public.cos_university_graduate_serving_attempts a on a.registry_id=g.id
left join lateral (
  select
    count(*) filter (where e.event_type='verified_outcome') as verified_outcomes,
    count(*) filter (where e.event_type in ('remediation_started','retraining_started','reevaluation_started','rollback')) as remediation_events
  from public.cos_university_graduate_lifecycle_events e where e.registry_id=g.id
) v on true
group by g.id,b.permanent_artifact_id,g.candidate_id,g.subject_id,g.trained_artifact_hash,g.promoted_at,g.activated_at,w.hired_at,w.status,v.verified_outcomes,v.remediation_events;

revoke all on public.cos_workforce_post_graduation_pipeline from public, anon, authenticated;
grant select on public.cos_workforce_post_graduation_pipeline to service_role;
comment on view public.cos_workforce_post_graduation_pipeline is
  'Canonical evidence-derived path from graduation through activation, Workforce dispatch, serving, verification and remediation. Never creates synthetic work or widens authority.';
