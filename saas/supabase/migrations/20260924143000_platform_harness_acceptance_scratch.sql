-- Production Harness acceptance scratch surface.
-- Service-role only. Contains no customer/business data and exists solely to prove
-- reversible Production Harness actions and compensation against a real datastore.

create table if not exists public.platform_harness_acceptance_scratch (
  scratch_key text primary key,
  run_id text not null,
  value text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint platform_harness_acceptance_scratch_key_chk
    check (scratch_key ~ '^[a-zA-Z0-9:._-]{1,180}$'),
  constraint platform_harness_acceptance_scratch_run_chk
    check (char_length(run_id) between 1 and 220),
  constraint platform_harness_acceptance_scratch_value_chk
    check (char_length(value) between 1 and 1000)
);

alter table public.platform_harness_acceptance_scratch enable row level security;

revoke all on table public.platform_harness_acceptance_scratch
  from public, anon, authenticated;

grant select, insert, update, delete on table public.platform_harness_acceptance_scratch
  to service_role;

create index if not exists platform_harness_acceptance_scratch_created_idx
  on public.platform_harness_acceptance_scratch (created_at desc);
