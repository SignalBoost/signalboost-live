-- Dedicated, service-role-only scratch surface for Platform Harness Production acceptance.
-- Contains no customer/business data. The canary may only use bounded keys/value markers.

create table if not exists public.platform_harness_acceptance_scratch (
  scratch_key text primary key,
  run_id text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  constraint platform_harness_acceptance_scratch_key_len check (char_length(scratch_key) between 1 and 240),
  constraint platform_harness_acceptance_run_len check (char_length(run_id) between 1 and 320),
  constraint platform_harness_acceptance_value_len check (char_length(value) between 1 and 400)
);

alter table public.platform_harness_acceptance_scratch enable row level security;

revoke all on table public.platform_harness_acceptance_scratch from anon, authenticated;
grant all on table public.platform_harness_acceptance_scratch to service_role;

comment on table public.platform_harness_acceptance_scratch is
  'Service-role-only ephemeral state used exclusively by the deployment-bound Platform Harness Production acceptance canary.';
