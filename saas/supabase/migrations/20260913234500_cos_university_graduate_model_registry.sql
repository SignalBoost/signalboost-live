-- COS University distilled-model platform adoption.
-- A promoted student is not terminally "done" at artifact creation. Once promotion gates clear,
-- iTMounts records the graduate as an organizational capability and carries it through runtime
-- binding, activation, quarantine/recertification, or retirement.

create table if not exists public.cos_university_graduate_model_registry (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  subject_id text not null,
  student_model_id text not null,
  trained_artifact_id text not null,
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  promotion_evidence_hash text not null check (promotion_evidence_hash ~ '^[a-f0-9]{64}$'),
  platform_scope jsonb not null default '{"kind":"subject_relevant_cos_capability"}'::jsonb,
  status text not null default 'pending_runtime' check (status in ('pending_runtime','canary','active','quarantined','retired')),
  runtime_provider text,
  runtime_model_id text,
  runtime_health_evidence_hash text check (runtime_health_evidence_hash is null or runtime_health_evidence_hash ~ '^[a-f0-9]{64}$'),
  activation_evidence_hash text check (activation_evidence_hash is null or activation_evidence_hash ~ '^[a-f0-9]{64}$'),
  rollback_artifact_ref text not null,
  authority_expanded boolean not null default false check (authority_expanded is false),
  promoted_at timestamptz not null,
  activated_at timestamptz,
  quarantined_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, trained_artifact_hash),
  check (jsonb_typeof(platform_scope) = 'object'),
  check (
    status <> 'active'
    or (
      length(btrim(coalesce(runtime_provider, ''))) > 0
      and length(btrim(coalesce(runtime_model_id, ''))) > 0
      and runtime_health_evidence_hash is not null
      and activation_evidence_hash is not null
      and activated_at is not null
    )
  )
);

create index if not exists cos_university_graduate_model_registry_active_subject_idx
  on public.cos_university_graduate_model_registry (subject_id, status, updated_at desc);

create index if not exists cos_university_graduate_model_registry_runtime_idx
  on public.cos_university_graduate_model_registry (status, runtime_provider, runtime_model_id)
  where status in ('canary', 'active');

alter table public.cos_university_graduate_model_registry enable row level security;
revoke all on table public.cos_university_graduate_model_registry from public, anon, authenticated;
grant select, insert, update, delete on table public.cos_university_graduate_model_registry to service_role;

comment on table public.cos_university_graduate_model_registry is
  'Host-controlled employment/adoption registry for promoted COS University distilled models. Promotion creates a pending_runtime graduate; serving activation remains separately evidence-gated.';
comment on column public.cos_university_graduate_model_registry.platform_scope is
  'COS-owned intended use/capability scope. It does not grant operational authority.';
comment on column public.cos_university_graduate_model_registry.status is
  'pending_runtime after academic promotion; active only after exact serving identity, health, activation and rollback evidence exist.';
