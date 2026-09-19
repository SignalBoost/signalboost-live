-- Durable hosted-teacher synthesis for COS University mass distillation.
-- This table is separate from the identity-only curriculum queue: it stores only public/CC0-derived
-- synthetic teacher outputs after a governed provider selection. Service role only; no credentials,
-- hidden reasoning, or private production data are permitted here.

alter table public.cos_university_mass_distillation_batch_runs
  add column if not exists teacher_provider text,
  add column if not exists teacher_transport text,
  add column if not exists teacher_training_rights text,
  add column if not exists teacher_provider_manifest_hash text;

alter table public.cos_university_mass_distillation_batch_runs
  drop constraint if exists cos_university_mass_distillation_teacher_training_rights_check;
alter table public.cos_university_mass_distillation_batch_runs
  add constraint cos_university_mass_distillation_teacher_training_rights_check
  check (teacher_training_rights is null or teacher_training_rights in ('open_license','provider_output_contractually_authorized'));

alter table public.cos_university_mass_distillation_batch_runs
  drop constraint if exists cos_university_mass_distillation_teacher_manifest_hash_check;
alter table public.cos_university_mass_distillation_batch_runs
  add constraint cos_university_mass_distillation_teacher_manifest_hash_check
  check (teacher_provider_manifest_hash is null or teacher_provider_manifest_hash ~ '^[a-f0-9]{64}$');

create table if not exists public.cos_university_mass_distillation_teacher_outputs (
  run_id uuid not null references public.cos_university_mass_distillation_batch_runs(id) on delete cascade,
  prompt_id text not null check (length(btrim(prompt_id)) between 8 and 160),
  prompt_hash text not null check (prompt_hash ~ '^[a-f0-9]{64}$'),
  teacher_id text not null check (length(btrim(teacher_id)) between 2 and 80),
  provider text not null check (provider in ('openai','anthropic','xai','custom')),
  model text not null check (length(btrim(model)) between 1 and 240),
  state text not null default 'pending' check (state in ('pending','complete','failed')),
  request_key text not null check (request_key ~ '^[a-f0-9]{64}$'),
  request_id text,
  response_text text,
  response_hash text check (response_hash is null or response_hash ~ '^[a-f0-9]{64}$'),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(12,8) not null default 0 check (estimated_cost_usd >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 20),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (run_id, prompt_id),
  check (
    (state = 'complete' and response_text is not null and length(btrim(response_text)) >= 80 and response_hash is not null)
    or (state <> 'complete' and response_text is null and response_hash is null)
  )
);

create index if not exists cos_university_mass_teacher_outputs_state_idx
  on public.cos_university_mass_distillation_teacher_outputs (run_id, state, updated_at);

alter table public.cos_university_mass_distillation_teacher_outputs enable row level security;
revoke all on table public.cos_university_mass_distillation_teacher_outputs from public, anon, authenticated;
grant select, insert, update, delete on table public.cos_university_mass_distillation_teacher_outputs to service_role;

comment on table public.cos_university_mass_distillation_teacher_outputs is
  'Durable, resumable hosted-provider teacher outputs for University mass distillation. Provider selection is fixed per run; no silent fallback is permitted.';
