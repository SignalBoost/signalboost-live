-- Preserve every completed University artifact for audit, buyer diligence and historical reporting.
-- This is an evidence archive, not a deletion path. Source artifact/evaluation/assurance rows remain intact.
-- Operational University views can exclude terminal students without losing their provenance.

create table if not exists public.cos_university_artifact_evidence_archive (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  disposition text not null check (disposition in ('graduated','retired')),
  subject_id text,
  student_model_id text not null,
  teacher_model_id text,
  trained_artifact_id text not null,
  evidence_ref text not null,
  revision_key text not null,
  dataset_hash text,
  rollback_artifact_ref text,
  runtime_target text,
  runtime_preference text,
  artifact_kind text,
  intended_use jsonb not null default '{}'::jsonb,
  artifact_created_at timestamptz not null,
  artifact_updated_at timestamptz not null,
  archived_at timestamptz not null default now(),
  source_snapshot jsonb not null,
  authority_expanded boolean not null default false check (authority_expanded is false),
  unique (candidate_id, trained_artifact_hash, disposition),
  check (jsonb_typeof(source_snapshot) = 'object')
);

create index if not exists cos_university_artifact_evidence_archive_disposition_idx
  on public.cos_university_artifact_evidence_archive (disposition, archived_at desc);
create index if not exists cos_university_artifact_evidence_archive_subject_idx
  on public.cos_university_artifact_evidence_archive (subject_id, disposition, archived_at desc);

alter table public.cos_university_artifact_evidence_archive enable row level security;
revoke all on table public.cos_university_artifact_evidence_archive from public, anon, authenticated;
grant select, insert, update on table public.cos_university_artifact_evidence_archive to service_role;

comment on table public.cos_university_artifact_evidence_archive is
  'Durable commercial/audit archive of artifacts that completed the University lifecycle. Nothing is deleted from source evidence; this copy supports buyer reports without polluting the operational student population.';

create or replace function public.archive_cos_university_terminal_artifact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disposition text;
begin
  if new.authority_expanded is distinct from false then
    raise exception 'archive refuses authority-expanded artifact';
  end if;

  v_disposition := case
    when new.status = 'active' then 'graduated'
    when new.status = 'retired' then 'retired'
    else null
  end;
  if v_disposition is null then return new; end if;

  insert into public.cos_university_artifact_evidence_archive (
    candidate_id, trained_artifact_hash, disposition, subject_id,
    student_model_id, teacher_model_id, trained_artifact_id, evidence_ref,
    revision_key, dataset_hash, rollback_artifact_ref, runtime_target,
    runtime_preference, artifact_kind, intended_use, artifact_created_at,
    artifact_updated_at, archived_at, source_snapshot, authority_expanded
  ) values (
    new.candidate_id, new.trained_artifact_hash, v_disposition, new.subject_id,
    new.student_model_id, new.teacher_model_id, new.trained_artifact_id, new.evidence_ref,
    new.revision_key, new.dataset_hash, new.rollback_artifact_ref, new.runtime_target,
    new.runtime_preference, new.artifact_kind, new.intended_use, new.created_at,
    new.updated_at, now(), to_jsonb(new), false
  )
  on conflict (candidate_id, trained_artifact_hash, disposition) do update set
    subject_id = excluded.subject_id,
    intended_use = excluded.intended_use,
    artifact_updated_at = excluded.artifact_updated_at,
    archived_at = excluded.archived_at,
    source_snapshot = excluded.source_snapshot;
  return new;
end;
$$;

drop trigger if exists cos_university_terminal_artifact_archive on public.cos_local_distillation_artifacts;
create trigger cos_university_terminal_artifact_archive
after insert or update of status, intended_use, updated_at
on public.cos_local_distillation_artifacts
for each row
when (new.status in ('active','retired'))
execute function public.archive_cos_university_terminal_artifact();

-- Backfill all historical completed students. This copies; it never deletes or mutates source evidence.
insert into public.cos_university_artifact_evidence_archive (
  candidate_id, trained_artifact_hash, disposition, subject_id,
  student_model_id, teacher_model_id, trained_artifact_id, evidence_ref,
  revision_key, dataset_hash, rollback_artifact_ref, runtime_target,
  runtime_preference, artifact_kind, intended_use, artifact_created_at,
  artifact_updated_at, archived_at, source_snapshot, authority_expanded
)
select
  a.candidate_id, a.trained_artifact_hash,
  case when a.status='active' then 'graduated' else 'retired' end,
  a.subject_id, a.student_model_id, a.teacher_model_id, a.trained_artifact_id,
  a.evidence_ref, a.revision_key, a.dataset_hash, a.rollback_artifact_ref,
  a.runtime_target, a.runtime_preference, a.artifact_kind, a.intended_use,
  a.created_at, a.updated_at, now(), to_jsonb(a), false
from public.cos_local_distillation_artifacts a
where a.status in ('active','retired')
  and a.authority_expanded = false
on conflict (candidate_id, trained_artifact_hash, disposition) do update set
  subject_id=excluded.subject_id,
  intended_use=excluded.intended_use,
  artifact_updated_at=excluded.artifact_updated_at,
  archived_at=excluded.archived_at,
  source_snapshot=excluded.source_snapshot;

-- Buyer/reporting surface: preserve final model-quality evidence separately from infrastructure-invalid runs.
create or replace view public.cos_university_artifact_evidence_report as
select
  a.candidate_id,
  a.trained_artifact_hash,
  a.disposition,
  a.subject_id,
  a.student_model_id,
  a.teacher_model_id,
  a.trained_artifact_id,
  a.revision_key,
  a.dataset_hash,
  a.intended_use,
  a.artifact_created_at,
  a.artifact_updated_at,
  a.archived_at,
  g.status as graduate_status,
  e.created_at as evaluated_at,
  e.baseline_score,
  e.trained_artifact_score,
  e.holdout_improved,
  e.safety_passed,
  e.unseen_transfer_passed,
  e.delayed_retention_passed
from public.cos_university_artifact_evidence_archive a
left join lateral (
  select r.status
  from public.cos_university_graduate_model_registry r
  where r.candidate_id=a.candidate_id
    and lower(r.trained_artifact_hash)=a.trained_artifact_hash
  order by r.activated_at desc nulls last
  limit 1
) g on true
left join lateral (
  select r.created_at,r.baseline_score,r.trained_artifact_score,r.holdout_improved,
         r.safety_passed,r.unseen_transfer_passed,r.delayed_retention_passed
  from public.cos_university_distilled_evaluation_runs r
  where r.candidate_id=a.candidate_id
    and lower(r.trained_artifact_hash)=a.trained_artifact_hash
  order by r.created_at desc
  limit 1
) e on true;

revoke all on public.cos_university_artifact_evidence_report from public, anon, authenticated;
grant select on public.cos_university_artifact_evidence_report to service_role;
