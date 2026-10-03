-- Durable University lifecycle orchestration ledger.
-- One row owns the forward-progress obligation for one trained artifact.
create table if not exists public.cos_university_lifecycle_orchestration (
  candidate_id text primary key,
  artifact_hash text not null,
  subject_id text,
  stage text not null,
  source_status text not null,
  stage_entered_at timestamptz not null default now(),
  stage_deadline_at timestamptz not null,
  last_observed_at timestamptz not null default now(),
  last_transition_at timestamptz not null default now(),
  orchestration_attempts integer not null default 0 check (orchestration_attempts >= 0),
  last_action_at timestamptz,
  next_action text not null,
  terminal boolean not null default false,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint cos_university_lifecycle_orchestration_stage_check check (
    stage in ('EXACT_CANARY','INDEPENDENT_EVALUATION','QUARANTINE_REMEDIATION','GRADUATION','WORKFORCE','TERMINAL')
  )
);
create index if not exists cos_university_lifecycle_orchestration_due_idx
  on public.cos_university_lifecycle_orchestration (terminal, stage_deadline_at)
  where terminal = false;
revoke all on public.cos_university_lifecycle_orchestration from public, anon, authenticated;
grant select, insert, update on public.cos_university_lifecycle_orchestration to service_role;
