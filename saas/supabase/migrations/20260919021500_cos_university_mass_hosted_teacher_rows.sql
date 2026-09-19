-- Parallel hosted-teacher evidence for University mass distillation.
-- Rows are synthetic teacher outputs only; provider secrets are never stored.

create table if not exists public.cos_university_mass_hosted_teacher_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cos_university_mass_distillation_batch_runs(id) on delete cascade,
  candidate_id text not null,
  batch_key text not null,
  prompt_id text not null,
  prompt_set_hash text not null check (prompt_set_hash ~ '^[a-f0-9]{64}$'),
  teacher_id text not null,
  provider text not null,
  model text not null,
  request_id text,
  response_text text not null,
  response_hash text not null check (response_hash ~ '^[a-f0-9]{64}$'),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  authority_expanded boolean not null default false check (authority_expanded is false),
  silent_fallback_allowed boolean not null default false check (silent_fallback_allowed is false),
  created_at timestamptz not null default now(),
  unique (run_id, prompt_id)
);

create index if not exists cos_university_mass_hosted_teacher_rows_run_idx
  on public.cos_university_mass_hosted_teacher_rows(run_id, created_at asc);

alter table public.cos_university_mass_hosted_teacher_rows enable row level security;
revoke all on table public.cos_university_mass_hosted_teacher_rows from public, anon, authenticated;
grant select, insert, update, delete on table public.cos_university_mass_hosted_teacher_rows to service_role;

comment on table public.cos_university_mass_hosted_teacher_rows is
  'Durable exact multi-provider teacher outputs for one mass-distillation run. No credentials, hidden reasoning, promotion authority, or provider fallback authority are stored.';
