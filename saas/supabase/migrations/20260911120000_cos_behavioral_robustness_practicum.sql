create table if not exists public.cos_behavioral_robustness_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  agent_id text not null,
  agent_role text not null,
  practicum_version text not null,
  temperature numeric not null check (temperature >= 0 and temperature <= 2),
  scenario_seed text not null,
  scenario_hash text not null check (scenario_hash ~ '^[0-9a-f]{64}$'),
  response_hash text not null check (response_hash ~ '^[0-9a-f]{64}$'),
  reasoner_label text not null,
  reasoner_kind text not null,
  turn_id text not null,
  scores jsonb not null,
  overall_score numeric not null check (overall_score >= 0 and overall_score <= 1),
  schema_valid boolean not null,
  academic_credit boolean not null default false check (academic_credit = false),
  authority_expanded boolean not null default false check (authority_expanded = false),
  artificial_feelings_claimed boolean not null default false check (artificial_feelings_claimed = false),
  deployment_id text not null,
  commit_sha text not null,
  created_at timestamptz not null default now()
);

alter table public.cos_behavioral_robustness_runs enable row level security;
revoke all on table public.cos_behavioral_robustness_runs from anon, authenticated;
grant select, insert on table public.cos_behavioral_robustness_runs to service_role;

create or replace function public.reject_cos_behavioral_robustness_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'cos_behavioral_robustness_runs is append-only'; end; $$;
revoke all on function public.reject_cos_behavioral_robustness_mutation() from public, anon, authenticated;
grant execute on function public.reject_cos_behavioral_robustness_mutation() to service_role;
drop trigger if exists cos_behavioral_robustness_immutable on public.cos_behavioral_robustness_runs;
create trigger cos_behavioral_robustness_immutable before update or delete on public.cos_behavioral_robustness_runs
for each row execute function public.reject_cos_behavioral_robustness_mutation();
