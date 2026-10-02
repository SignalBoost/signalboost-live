-- Permanent iTMounts artifact identity and immutable birth provenance.
-- Identity is assigned at artifact registration, before evaluation/graduation.
-- Existing rows are explicitly marked as legacy backfill; no missing history is invented.

alter table public.cos_local_distillation_artifacts
  add column if not exists permanent_artifact_id uuid;

update public.cos_local_distillation_artifacts
set permanent_artifact_id = gen_random_uuid()
where permanent_artifact_id is null;

alter table public.cos_local_distillation_artifacts
  alter column permanent_artifact_id set default gen_random_uuid(),
  alter column permanent_artifact_id set not null;

create unique index if not exists cos_local_distillation_artifacts_permanent_id_uidx
  on public.cos_local_distillation_artifacts (permanent_artifact_id);

create table if not exists public.cos_university_artifact_birth_certificates (
  permanent_artifact_id uuid primary key,
  candidate_id text not null,
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  artifact_kind text not null,
  creator text not null default 'itmounts',
  issuing_system text not null default 'cos_university',
  origin_jurisdiction text,
  student_model_id text not null,
  teacher_model_id text,
  training_evidence_ref text not null,
  revision_key text not null check (revision_key ~ '^[a-f0-9]{64}$'),
  dataset_hash text check (dataset_hash is null or dataset_hash ~ '^[a-f0-9]{64}$'),
  parent_permanent_artifact_id uuid,
  issuance_kind text not null check (issuance_kind in ('native_birth','legacy_backfill')),
  born_at timestamptz not null,
  issued_at timestamptz not null default now(),
  authority_expanded boolean not null default false check (authority_expanded is false),
  unique (candidate_id, trained_artifact_hash),
  foreign key (parent_permanent_artifact_id)
    references public.cos_university_artifact_birth_certificates(permanent_artifact_id)
);

alter table public.cos_university_artifact_birth_certificates enable row level security;
revoke all on table public.cos_university_artifact_birth_certificates from public, anon, authenticated;
grant select, insert on table public.cos_university_artifact_birth_certificates to service_role;

create or replace function public.register_cos_artifact_birth_certificate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cos_university_artifact_birth_certificates (
    permanent_artifact_id, candidate_id, trained_artifact_hash, artifact_kind,
    creator, issuing_system, student_model_id, teacher_model_id,
    training_evidence_ref, revision_key, dataset_hash, issuance_kind,
    born_at, authority_expanded
  ) values (
    new.permanent_artifact_id, new.candidate_id, new.trained_artifact_hash, new.artifact_kind,
    'itmounts', 'cos_university', new.student_model_id, new.teacher_model_id,
    new.evidence_ref, new.revision_key, new.dataset_hash, 'native_birth',
    new.created_at, false
  )
  on conflict (permanent_artifact_id) do nothing;
  return new;
end;
$$;

revoke all on function public.register_cos_artifact_birth_certificate() from public, anon, authenticated;

drop trigger if exists cos_artifact_birth_certificate_on_insert on public.cos_local_distillation_artifacts;
create trigger cos_artifact_birth_certificate_on_insert
after insert on public.cos_local_distillation_artifacts
for each row execute function public.register_cos_artifact_birth_certificate();

-- Backfill only facts already present in the authoritative artifact library.
insert into public.cos_university_artifact_birth_certificates (
  permanent_artifact_id, candidate_id, trained_artifact_hash, artifact_kind,
  creator, issuing_system, student_model_id, teacher_model_id,
  training_evidence_ref, revision_key, dataset_hash, issuance_kind,
  born_at, authority_expanded
)
select
  a.permanent_artifact_id, a.candidate_id, a.trained_artifact_hash, a.artifact_kind,
  'itmounts', 'cos_university', a.student_model_id, a.teacher_model_id,
  a.evidence_ref, a.revision_key, a.dataset_hash, 'legacy_backfill',
  a.created_at, false
from public.cos_local_distillation_artifacts a
on conflict (permanent_artifact_id) do nothing;

create or replace function public.prevent_cos_artifact_birth_certificate_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'artifact_birth_certificate_is_immutable' using errcode = '55000';
end;
$$;

revoke all on function public.prevent_cos_artifact_birth_certificate_mutation() from public, anon, authenticated;

drop trigger if exists cos_artifact_birth_certificate_immutable
  on public.cos_university_artifact_birth_certificates;
create trigger cos_artifact_birth_certificate_immutable
before update or delete on public.cos_university_artifact_birth_certificates
for each row execute function public.prevent_cos_artifact_birth_certificate_mutation();

comment on column public.cos_local_distillation_artifacts.permanent_artifact_id is
  'Permanent iTMounts artifact identity assigned at registration. It is not a version hash, candidate ID, graduate ID, or runtime instance ID.';
comment on table public.cos_university_artifact_birth_certificates is
  'Immutable artifact birth/provenance records. Legacy rows are explicitly marked and never fabricate missing provenance.';
