-- Run manually ONLY AFTER the stale-gateway code fix is live.
with wrong as (
  select a.id
  from public.cos_local_distillation_artifacts a
  where a.status = 'quarantined'
    and exists (select 1 from public.cos_university_learning_assurance_events x
      where x.candidate_id = a.candidate_id and x.event_type = 'fine_tune'
        and x.evidence->>'profile' = 'cos_mass_distilled_independent_evaluation_runtime_v1'
        and x.evidence->>'claim' = 'mass_distilled_evaluation_attempts_exhausted'
        and lower(x.evidence->>'artifactHash') = lower(a.trained_artifact_hash))
    and exists (select 1 from public.cos_university_learning_assurance_events f
      where f.candidate_id = a.candidate_id and f.event_type = 'fine_tune'
        and f.evidence->>'profile' = 'cos_mass_distilled_independent_evaluation_runtime_v1'
        and f.evidence->>'claim' = 'mass_distilled_independent_evaluation_failed'
        and lower(f.evidence->>'error') like 'mass_distilled_evaluation_runpod_http_409:baseline:%'
        and (lower(f.evidence->>'error') like '%xsa_exact_model_mismatch%'
          or lower(f.evidence->>'error') like '%distilled_exact_model_mismatch%'))
    and not exists (select 1 from public.cos_university_learning_assurance_events c
      where c.candidate_id = a.candidate_id
        and c.evidence->>'claim' = 'mass_distilled_independent_evaluation_completed'
        and lower(c.evidence->>'artifactHash') = lower(a.trained_artifact_hash))
    and not exists (select 1 from public.cos_university_learning_assurance_events r
      where r.candidate_id = a.candidate_id and r.evidence->>'claim' = 'builder_residency_failed')
), restored as (
  update public.cos_local_distillation_artifacts a
  set status = 'evaluation_pending', updated_at = now()
  from wrong w
  where a.id = w.id and a.status = 'quarantined'
  returning a.candidate_id, a.trained_artifact_hash, a.subject_id
)
insert into public.cos_university_learning_assurance_events
  (event_key, event_type, subject_id, candidate_id, evidence_hash, evidence, verifier, observed_at)
select
  encode(sha256(convert_to('stale_gateway_exhaustion_reversed|' || r.candidate_id || '|' || r.trained_artifact_hash, 'UTF8')), 'hex'),
  'fine_tune', r.subject_id, r.candidate_id,
  encode(sha256(convert_to(j.body::text, 'UTF8')), 'hex'), j.body, 'host_controller', now()
from restored r
cross join lateral (select jsonb_build_object(
  'profile', 'cos_mass_distilled_evaluation_disposition_repair_v1',
  'claim', 'mass_distilled_evaluation_exhaustion_reversed',
  'candidateId', r.candidate_id,
  'artifactHash', r.trained_artifact_hash,
  'reason', 'stale_gateway_409_was_counted_as_the_students_failure',
  'nextStatus', 'evaluation_pending',
  'evaluationPassed', false,
  'productionTrafficAuthorized', false,
  'authorityExpanded', false) as body) j
on conflict (event_key) do nothing;
