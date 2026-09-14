-- Repair local distillation artifact dataset identity from the authoritative partition event.
-- The trained-artifact callback may omit datasetHash; revisionKey binds the artifact to the exact
-- pre-training partition evidence without hard-coding any candidate-specific hash.

with partition_evidence as (
  select distinct on (e.candidate_id, lower(e.evidence->>'revisionKey'))
    e.candidate_id,
    lower(e.evidence->>'revisionKey') as revision_key,
    lower(e.evidence->>'datasetHash') as dataset_hash
  from public.cos_university_learning_assurance_events e
  where e.event_type = 'fine_tune'
    and e.verifier = 'training_executor'
    and e.evidence->>'profile' = 'cos_university_fine_tune_evidence_v1'
    and e.evidence->>'claim' = 'partition_manifests_registered'
    and lower(coalesce(e.evidence->>'revisionKey','')) ~ '^[a-f0-9]{64}$'
    and lower(coalesce(e.evidence->>'datasetHash','')) ~ '^[a-f0-9]{64}$'
  order by e.candidate_id, lower(e.evidence->>'revisionKey'), e.observed_at desc
)
update public.cos_local_distillation_artifacts a
set dataset_hash = p.dataset_hash,
    updated_at = now()
from partition_evidence p
where a.candidate_id = p.candidate_id
  and a.revision_key = p.revision_key
  and (a.dataset_hash is null or a.dataset_hash <> p.dataset_hash);
