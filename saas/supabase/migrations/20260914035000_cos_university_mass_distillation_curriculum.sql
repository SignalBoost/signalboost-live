-- iTMounts COS University mass-distillation curriculum queue.
-- This is a non-spending packaging surface. It stores source identities/rights classes only, never
-- source text, prompts, responses, credentials or hidden reasoning. Provider dispatch and Production
-- activation remain separate governed boundaries.

create table if not exists public.cos_university_distillation_curriculum_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique check (batch_key ~ '^[a-f0-9]{64}$'),
  curriculum_hash text not null check (curriculum_hash ~ '^[a-f0-9]{64}$'),
  subject_id text not null,
  student_model_id text not null default 'Qwen/Qwen3-4B',
  source_policy text not null default 'public_domain_cc0_v1',
  source_hashes text[] not null,
  source_count integer not null check (source_count between 20 and 128),
  rights_classes text[] not null,
  minimum_confidence double precision not null default 0.80 check (minimum_confidence >= 0 and minimum_confidence <= 1),
  status text not null default 'prepared' check (
    status in ('prepared','teacher_synthesis_ready','consumed','superseded','quarantined')
  ),
  dispatch_authorized boolean not null default false check (dispatch_authorized is false),
  authority_expanded boolean not null default false check (authority_expanded is false),
  prepared_at timestamptz not null default now(),
  consumed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (cardinality(source_hashes) = source_count),
  check (cardinality(rights_classes) >= 1)
);

create index if not exists cos_university_distillation_curriculum_status_idx
  on public.cos_university_distillation_curriculum_batches (status, prepared_at desc);
create index if not exists cos_university_distillation_curriculum_subject_idx
  on public.cos_university_distillation_curriculum_batches (subject_id, status, prepared_at desc);

alter table public.cos_university_distillation_curriculum_batches enable row level security;
revoke all on table public.cos_university_distillation_curriculum_batches from public, anon, authenticated;
grant select, insert, update on table public.cos_university_distillation_curriculum_batches to service_role;

comment on table public.cos_university_distillation_curriculum_batches is
  'Non-spending iTMounts University queue of rights-cleared retained-learning identities for synthetic teacher/distillation preparation. No source text is stored here.';
comment on column public.cos_university_distillation_curriculum_batches.dispatch_authorized is
  'Must remain false in this queue. Cost-bearing teacher/training dispatch requires a separate owner-governed authorization surface.';
