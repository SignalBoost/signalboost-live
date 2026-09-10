-- Immutable host-owned evidence for controlled fine-tuning, gated-path Production verification,
-- and real-world learning outcomes. These ledgers record proof; they never award grades directly.

create table if not exists public.cos_university_learning_assurance_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null check (event_type in ('fine_tune','production_path','learning_outcome')),
  subject_id text,
  candidate_id text,
  path_id text,
  deployment_id text,
  commit_sha text,
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  verifier text not null check (verifier in ('host_controller','host_production_verifier','independent_scorer')),
  observed_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at > observed_at),
  check (event_type <> 'fine_tune' or candidate_id is not null),
  check (event_type <> 'production_path' or (path_id is not null and deployment_id is not null and commit_sha is not null))
);

create index if not exists cos_university_learning_assurance_type_idx
  on public.cos_university_learning_assurance_events(event_type, observed_at desc);
create index if not exists cos_university_learning_assurance_path_idx
  on public.cos_university_learning_assurance_events(path_id, deployment_id, commit_sha, observed_at desc)
  where event_type = 'production_path';

comment on table public.cos_university_learning_assurance_events is
  'Append-only host evidence. Fine-tune promotion, feature-path verification, retention, transfer, and improved outcomes must resolve to recorded independent proof.';

alter table public.cos_university_learning_assurance_events enable row level security;
revoke all on public.cos_university_learning_assurance_events from anon, authenticated;
grant select, insert on public.cos_university_learning_assurance_events to service_role;

create or replace function public.prevent_cos_university_learning_assurance_mutation()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  raise exception 'cos_university_learning_assurance_events is append-only';
end;
$$;

revoke all on function public.prevent_cos_university_learning_assurance_mutation() from public, anon, authenticated;
grant execute on function public.prevent_cos_university_learning_assurance_mutation() to service_role;

drop trigger if exists cos_university_learning_assurance_immutable
  on public.cos_university_learning_assurance_events;
create trigger cos_university_learning_assurance_immutable
before update or delete on public.cos_university_learning_assurance_events
for each row execute function public.prevent_cos_university_learning_assurance_mutation();
