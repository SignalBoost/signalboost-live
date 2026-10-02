-- Verifiable graduate resume / AI CV.
-- This is a derived record, not editable marketing copy. The permanent artifact ID is the identity anchor.

create or replace view public.cos_university_graduate_resumes
with (security_invoker = true)
as
select
  b.permanent_artifact_id as ai_id,
  b.candidate_id,
  b.trained_artifact_hash,
  b.artifact_kind,
  b.creator,
  b.issuing_system,
  b.origin_jurisdiction,
  b.student_model_id,
  b.teacher_model_id,
  b.training_evidence_ref,
  b.dataset_hash,
  b.parent_permanent_artifact_id,
  b.issuance_kind,
  b.born_at,
  g.id as graduate_registry_id,
  g.subject_id,
  g.status as graduate_status,
  g.runtime_provider,
  g.runtime_model_id,
  g.promotion_evidence_hash,
  g.runtime_health_evidence_hash,
  g.activation_evidence_hash,
  g.promoted_at as graduated_at,
  g.activated_at,
  coalesce(l.lifecycle_event_count,0)::bigint as lifecycle_event_count,
  coalesce(l.serving_started,0)::bigint as serving_started,
  coalesce(l.serving_succeeded,0)::bigint as serving_succeeded,
  coalesce(l.serving_failed,0)::bigint as serving_failed,
  coalesce(l.verified_outcomes,0)::bigint as verified_outcomes,
  coalesce(l.health_observations,0)::bigint as health_observations,
  coalesce(l.drift_events,0)::bigint as drift_events,
  coalesce(l.remediation_events,0)::bigint as remediation_events,
  coalesce(l.retraining_events,0)::bigint as retraining_events,
  coalesce(l.reevaluation_events,0)::bigint as reevaluation_events,
  coalesce(l.rollback_events,0)::bigint as rollback_events,
  coalesce(l.retirement_events,0)::bigint as retirement_events,
  l.first_lifecycle_event_at,
  l.last_lifecycle_event_at,
  coalesce(s.distinct_serving_attempts,0)::bigint as distinct_serving_attempts,
  coalesce(s.successful_attempts,0)::bigint as successful_attempts,
  coalesce(s.failed_attempts,0)::bigint as failed_attempts,
  s.first_served_at,
  s.last_served_at
from public.cos_university_artifact_birth_certificates b
join public.cos_university_graduate_model_registry g
  on g.candidate_id=b.candidate_id
 and g.trained_artifact_hash=b.trained_artifact_hash
left join lateral (
  select
    count(*) as lifecycle_event_count,
    count(*) filter (where e.event_type='serving_started') as serving_started,
    count(*) filter (where e.event_type='serving_succeeded') as serving_succeeded,
    count(*) filter (where e.event_type='serving_failed') as serving_failed,
    count(*) filter (where e.event_type='verified_outcome') as verified_outcomes,
    count(*) filter (where e.event_type='health_observed') as health_observations,
    count(*) filter (where e.event_type='drift_detected') as drift_events,
    count(*) filter (where e.event_type='remediation_started') as remediation_events,
    count(*) filter (where e.event_type='retraining_started') as retraining_events,
    count(*) filter (where e.event_type='reevaluation_started') as reevaluation_events,
    count(*) filter (where e.event_type='rollback') as rollback_events,
    count(*) filter (where e.event_type='retired') as retirement_events,
    min(e.observed_at) as first_lifecycle_event_at,
    max(e.observed_at) as last_lifecycle_event_at
  from public.cos_university_graduate_lifecycle_events e
  where e.registry_id=g.id
) l on true
left join lateral (
  select
    count(distinct a.attempt_id) as distinct_serving_attempts,
    count(distinct a.attempt_id) filter (where a.phase='attempt_succeeded') as successful_attempts,
    count(distinct a.attempt_id) filter (where a.phase='attempt_failed') as failed_attempts,
    min(a.recorded_at) as first_served_at,
    max(a.recorded_at) as last_served_at
  from public.cos_university_graduate_serving_attempts a
  where a.registry_id=g.id
) s on true;

revoke all on public.cos_university_graduate_resumes from public, anon, authenticated;
grant select on public.cos_university_graduate_resumes to service_role;

comment on view public.cos_university_graduate_resumes is
  'Evidence-derived AI resume/CV for graduated artifacts. Permanent AI-ID is the identity anchor; education, graduation, deployment, work history, verified outcomes, health, remediation, retraining, rollback and retirement are derived from authoritative records.';
