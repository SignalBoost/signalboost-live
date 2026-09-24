-- Append-only Working-COS provider job evidence. A row is an event, never mutable state.
-- This closes the ambiguous provider-acceptance window without allowing job telemetry to mint
-- training, Production traffic, authority, or University graduation.

create table if not exists public.cos_working_distillation_job_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (event_key ~ '^[a-f0-9]{64}$'),
  candidate_id text not null,
  operation text not null check (operation in ('prepare_dataset','train')),
  event_type text not null check (event_type in ('dispatch_intent','provider_accepted','provider_failed','callback_recorded')),
  idempotency_key text not null check (idempotency_key ~ '^[a-f0-9]{64}$'),
  job_id text,
  job_url text,
  runtime_binding_key text not null check (runtime_binding_key ~ '^[a-f0-9]{64}$'),
  runtime_digest text not null check (runtime_digest ~ '^[a-f0-9]{64}$'),
  base_model_id text not null,
  base_model_revision text not null check (base_model_revision ~ '^[a-f0-9]{40}$'),
  dataset_hash text not null check (dataset_hash ~ '^[a-f0-9]{64}$'),
  training_manifest_hash text not null check (training_manifest_hash ~ '^[a-f0-9]{64}$'),
  holdout_manifest_hash text not null check (holdout_manifest_hash ~ '^[a-f0-9]{64}$'),
  provider text not null default 'huggingface' check (provider='huggingface'),
  provider_flavor text,
  hourly_cost_usd numeric(12,6),
  max_estimated_cost_usd numeric(12,6),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  authority_expanded boolean not null default false check (authority_expanded is false),
  production_traffic_authorized boolean not null default false check (production_traffic_authorized is false),
  university_graduation_claimed boolean not null default false check (university_graduation_claimed is false),
  created_at timestamptz not null default now()
);

create index if not exists cos_working_distillation_job_events_candidate_idx
  on public.cos_working_distillation_job_events (candidate_id, created_at desc);
create index if not exists cos_working_distillation_job_events_lookup_idx
  on public.cos_working_distillation_job_events (idempotency_key, operation, created_at desc);

alter table public.cos_working_distillation_job_events enable row level security;
revoke all on table public.cos_working_distillation_job_events from public, anon, authenticated;
grant select, insert on table public.cos_working_distillation_job_events to service_role;

drop trigger if exists cos_working_distillation_job_events_immutable on public.cos_working_distillation_job_events;
create trigger cos_working_distillation_job_events_immutable
before update or delete on public.cos_working_distillation_job_events
for each row execute function public.reject_cos_university_distillation_asset_mutation();

comment on table public.cos_working_distillation_job_events is
  'Append-only dispatch/callback evidence for bounded Working-COS direct training. Provider acceptance and callbacks cannot authorize Production traffic or graduation.';
