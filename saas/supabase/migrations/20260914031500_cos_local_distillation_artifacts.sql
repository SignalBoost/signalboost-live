-- iTMounts local distillation artifact library.
-- Every successfully trained distilled artifact becomes an iTMounts local-runtime candidate immediately.
-- This table is NOT a Production-traffic authorization surface: evaluation, promotion, runtime health,
-- canary and graduate activation remain separate gates.

create table if not exists public.cos_local_distillation_artifacts (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  subject_id text,
  student_model_id text not null,
  teacher_model_id text,
  trained_artifact_id text not null,
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  evidence_ref text not null,
  revision_key text not null check (revision_key ~ '^[a-f0-9]{64}$'),
  dataset_hash text check (dataset_hash is null or dataset_hash ~ '^[a-f0-9]{64}$'),
  rollback_artifact_ref text,
  status text not null default 'trained_pending_rollback' check (
    status in ('trained_pending_rollback','evaluation_pending','runtime_pending','active','quarantined','retired')
  ),
  runtime_target text not null default 'itmounts_local',
  runtime_preference text not null default 'runpod_serverless_primary_deepinfra_fallback',
  artifact_kind text not null default 'lora_adapter' check (artifact_kind in ('lora_adapter','merged_model')),
  intended_use jsonb not null default '{"owner":"itmounts","trafficAuthorized":false}'::jsonb,
  authority_expanded boolean not null default false check (authority_expanded is false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, trained_artifact_hash),
  check (jsonb_typeof(intended_use) = 'object')
);

create index if not exists cos_local_distillation_artifacts_status_idx
  on public.cos_local_distillation_artifacts (status, updated_at desc);
create index if not exists cos_local_distillation_artifacts_student_idx
  on public.cos_local_distillation_artifacts (student_model_id, status, updated_at desc);

alter table public.cos_local_distillation_artifacts enable row level security;
revoke all on table public.cos_local_distillation_artifacts from public, anon, authenticated;
grant select, insert, update, delete on table public.cos_local_distillation_artifacts to service_role;

comment on table public.cos_local_distillation_artifacts is
  'iTMounts-owned distillation artifact library. Training completion registers local-runtime candidates; this table never authorizes Production traffic.';
comment on column public.cos_local_distillation_artifacts.status is
  'Artifact lifecycle only. active mirrors independently authorized graduate runtime activation; it does not create that authorization.';
comment on column public.cos_local_distillation_artifacts.runtime_preference is
  'Intended serving topology: RunPod Serverless first, DeepInfra only as fallback/escalation.';

with trained as (
  select distinct on (e.candidate_id, lower(e.evidence->>'artifactHash'))
    e.candidate_id, e.subject_id, e.evidence, e.observed_at
  from public.cos_university_learning_assurance_events e
  where e.event_type = 'fine_tune'
    and e.verifier = 'training_executor'
    and e.evidence->>'profile' = 'cos_university_fine_tune_evidence_v1'
    and e.evidence->>'claim' = 'trained_artifact_registered'
    and e.evidence->>'trainingMode' = 'distillation'
    and coalesce((e.evidence->>'authorityExpanded')::boolean, true) = false
    and lower(coalesce(e.evidence->>'artifactHash','')) ~ '^[a-f0-9]{64}$'
    and coalesce(e.evidence->>'revisionKey','') ~ '^[a-f0-9]{64}$'
    and length(btrim(coalesce(e.evidence->>'trainedArtifactId',''))) > 0
  order by e.candidate_id, lower(e.evidence->>'artifactHash'), e.observed_at desc
), normalized as (
  select t.*,
    t.evidence->>'trainedArtifactId' as trained_artifact_id,
    lower(t.evidence->>'artifactHash') as trained_artifact_hash,
    t.evidence->>'evidenceRef' as evidence_ref,
    t.evidence->>'revisionKey' as revision_key,
    nullif(lower(t.evidence->>'datasetHash'),'') as dataset_hash,
    t.evidence#>>'{distillationCandidate,studentModelId}' as student_model_id,
    nullif(t.evidence#>>'{distillationCandidate,teacherModelId}','') as teacher_model_id
  from trained t
), with_rollback as (
  select n.*,
    (
      select r.evidence->>'rollbackArtifactRef'
      from public.cos_university_learning_assurance_events r
      where r.event_type = 'fine_tune'
        and r.verifier = 'training_executor'
        and r.candidate_id = n.candidate_id
        and r.evidence->>'profile' = 'cos_university_fine_tune_evidence_v1'
        and r.evidence->>'claim' = 'rollback_artifact_registered'
        and lower(coalesce(r.evidence->>'artifactHash','')) = n.trained_artifact_hash
        and coalesce(r.evidence->>'revisionKey','') = n.revision_key
      order by r.observed_at desc limit 1
    ) as rollback_artifact_ref
  from normalized n
  where length(btrim(coalesce(n.student_model_id,''))) > 0
    and length(btrim(coalesce(n.evidence_ref,''))) > 0
)
insert into public.cos_local_distillation_artifacts (
  candidate_id, subject_id, student_model_id, teacher_model_id,
  trained_artifact_id, trained_artifact_hash, evidence_ref, revision_key, dataset_hash,
  rollback_artifact_ref, status, runtime_target, runtime_preference, artifact_kind,
  intended_use, authority_expanded, created_at, updated_at
)
select
  w.candidate_id, w.subject_id, w.student_model_id, w.teacher_model_id,
  w.trained_artifact_id, w.trained_artifact_hash, w.evidence_ref, w.revision_key,
  case when w.dataset_hash ~ '^[a-f0-9]{64}$' then w.dataset_hash else null end,
  nullif(w.rollback_artifact_ref,''),
  case when length(btrim(coalesce(w.rollback_artifact_ref,''))) > 0 then 'evaluation_pending' else 'trained_pending_rollback' end,
  'itmounts_local','runpod_serverless_primary_deepinfra_fallback','lora_adapter',
  jsonb_build_object('owner','itmounts','canonicalBaseModel',w.student_model_id,'adapterModel',w.trained_artifact_id,'trafficAuthorized',false,'nextGate','independent_evaluation'),
  false, w.observed_at, now()
from with_rollback w
on conflict (candidate_id, trained_artifact_hash) do update set
  rollback_artifact_ref = coalesce(excluded.rollback_artifact_ref, public.cos_local_distillation_artifacts.rollback_artifact_ref),
  status = case
    when public.cos_local_distillation_artifacts.status in ('active','quarantined','retired','runtime_pending') then public.cos_local_distillation_artifacts.status
    when excluded.rollback_artifact_ref is not null then 'evaluation_pending'
    else public.cos_local_distillation_artifacts.status
  end,
  intended_use = excluded.intended_use,
  updated_at = now();
