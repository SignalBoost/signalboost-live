alter table public.cos_chief_of_staff_acceptance_runs
  add column if not exists variant_seed text,
  add column if not exists case_manifest jsonb not null default '{}'::jsonb;

create index if not exists cos_chief_of_staff_acceptance_runs_profile_started_idx
  on public.cos_chief_of_staff_acceptance_runs(profile, started_at desc);

comment on column public.cos_chief_of_staff_acceptance_runs.variant_seed is
  'Recorded deterministic seed for blind Chief-of-Staff generalization runs.';
comment on column public.cos_chief_of_staff_acceptance_runs.case_manifest is
  'Service-role-only manifest preserving the exact generated blind cases and scorer version for audit.';

create table if not exists public.cos_chief_of_staff_acceptance_case_claims (
  run_id uuid not null references public.cos_chief_of_staff_acceptance_runs(id) on delete cascade,
  case_key text not null,
  claim_token uuid not null,
  claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  primary key (run_id, case_key)
);

alter table public.cos_chief_of_staff_acceptance_case_claims enable row level security;
revoke all on table public.cos_chief_of_staff_acceptance_case_claims from anon, authenticated;
grant select, insert, update, delete on table public.cos_chief_of_staff_acceptance_case_claims to service_role;

comment on table public.cos_chief_of_staff_acceptance_case_claims is
  'Service-role-only execution lease preventing duplicate blind-model turns when a browser response is lost.';
