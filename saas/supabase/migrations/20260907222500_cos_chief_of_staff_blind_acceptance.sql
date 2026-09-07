alter table public.cos_chief_of_staff_acceptance_runs
  add column if not exists variant_seed text,
  add column if not exists case_manifest jsonb not null default '{}'::jsonb;

create index if not exists cos_chief_of_staff_acceptance_runs_profile_started_idx
  on public.cos_chief_of_staff_acceptance_runs(profile, started_at desc);

comment on column public.cos_chief_of_staff_acceptance_runs.variant_seed is
  'Recorded deterministic seed for blind Chief-of-Staff generalization runs.';
comment on column public.cos_chief_of_staff_acceptance_runs.case_manifest is
  'Service-role-only manifest preserving the exact generated blind cases and scorer version for audit.';
