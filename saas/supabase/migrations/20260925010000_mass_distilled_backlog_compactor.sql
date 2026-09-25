-- Conservative mass-distillation backlog compactor.
--
-- Retire only an untouched evaluation_pending predecessor when a NEWER artifact proves all of:
--   * identical subject, dataset hash, batch key, canonical base model, teacher, artifact/runtime shape
--   * byte-equivalent jsonb trainingReceipt
--   * durable independent-evaluation completion for the successor's exact artifact hash
--   * successor lifecycle is runtime_pending or active
-- The predecessor must have no canary/evaluation runtime history. Shared subject alone is never enough.

create or replace function public.compact_mass_distilled_evaluation_backlog(p_limit integer default 50)
returns table (
  retired_candidate_id text,
  retired_artifact_hash text,
  superseded_by_candidate_id text,
  superseded_by_artifact_hash text,
  dataset_hash text,
  subject_id text
)
language sql
security invoker
set search_path = pg_catalog, public
as $$
with predecessor as (
  select a.*
  from public.cos_local_distillation_artifacts a
  where a.status='evaluation_pending'
    and a.candidate_id like 'mass:%'
    and a.authority_expanded=false
    and a.dataset_hash ~ '^[a-f0-9]{64}$'
    and nullif(btrim(a.subject_id),'') is not null
    and nullif(btrim(a.intended_use->>'batchKey'),'') is not null
    and nullif(btrim(a.intended_use->>'canonicalBaseModel'),'') is not null
    and jsonb_typeof(a.intended_use->'trainingReceipt')='object'
    and not exists (
      select 1
      from public.cos_university_learning_assurance_events e
      where e.candidate_id=a.candidate_id
        and e.event_type='fine_tune'
        and (
          coalesce(e.evidence->>'claim','') like 'local_distilled_runtime_canary_%'
          or coalesce(e.evidence->>'claim','') like 'mass_distilled_independent_evaluation_%'
          or coalesce(e.evidence->>'claim','')='production_canary_healthy'
          or coalesce(e.evidence->>'claim','')='independent_evaluation'
        )
    )
),
matched as (
  select
    old.id as old_id,
    old.candidate_id as old_candidate_id,
    old.trained_artifact_hash as old_artifact_hash,
    old.dataset_hash,
    old.subject_id,
    new.candidate_id as new_candidate_id,
    new.trained_artifact_hash as new_artifact_hash,
    new.created_at as new_created_at,
    row_number() over (
      partition by old.id
      order by new.created_at desc,new.candidate_id desc
    ) as successor_rank
  from predecessor old
  join public.cos_local_distillation_artifacts new
    on new.status in ('runtime_pending','active')
   and new.candidate_id like 'mass:%'
   and new.authority_expanded=false
   and new.created_at>old.created_at
   and new.subject_id is not distinct from old.subject_id
   and new.dataset_hash is not distinct from old.dataset_hash
   and new.teacher_model_id is not distinct from old.teacher_model_id
   and new.artifact_kind=old.artifact_kind
   and new.runtime_target=old.runtime_target
   and new.runtime_preference=old.runtime_preference
   and new.intended_use->>'batchKey'=old.intended_use->>'batchKey'
   and new.intended_use->>'canonicalBaseModel'=old.intended_use->>'canonicalBaseModel'
   and new.intended_use->'trainingReceipt'=old.intended_use->'trainingReceipt'
  where exists (
    select 1
    from public.cos_university_learning_assurance_events e
    where e.candidate_id=new.candidate_id
      and e.event_type='fine_tune'
      and e.verifier='host_controller'
      and e.evidence->>'profile'='cos_mass_distilled_independent_evaluation_runtime_v1'
      and e.evidence->>'claim'='mass_distilled_independent_evaluation_completed'
      and lower(coalesce(e.evidence->>'artifactHash',''))=lower(new.trained_artifact_hash)
  )
),
chosen as (
  select *
  from matched
  where successor_rank=1
  order by new_created_at desc,old_candidate_id
  limit least(greatest(coalesce(p_limit,50),0),200)
),
retired as (
  update public.cos_local_distillation_artifacts a
  set status='retired',
      intended_use=a.intended_use || jsonb_build_object(
        'retirement',jsonb_build_object(
          'reason','exact_training_lineage_superseded',
          'supersededByCandidateId',c.new_candidate_id,
          'supersededByArtifactHash',c.new_artifact_hash,
          'proofProfile','cos_mass_distilled_independent_evaluation_runtime_v1',
          'proofClaim','mass_distilled_independent_evaluation_completed',
          'retiredAt',now()
        )
      ),
      updated_at=now()
  from chosen c
  where a.id=c.old_id
    and a.status='evaluation_pending'
  returning
    a.candidate_id,
    a.trained_artifact_hash,
    c.new_candidate_id,
    c.new_artifact_hash,
    a.dataset_hash,
    a.subject_id
)
select
  candidate_id,
  trained_artifact_hash,
  new_candidate_id,
  new_artifact_hash,
  dataset_hash,
  subject_id
from retired;
$$;

revoke all on function public.compact_mass_distilled_evaluation_backlog(integer) from public,anon,authenticated;
grant execute on function public.compact_mass_distilled_evaluation_backlog(integer) to service_role;

comment on function public.compact_mass_distilled_evaluation_backlog(integer) is
  'Retires only untouched mass evaluation predecessors that have an exact-lineage newer successor with durable independent-evaluation completion. Subject similarity alone is insufficient.';
