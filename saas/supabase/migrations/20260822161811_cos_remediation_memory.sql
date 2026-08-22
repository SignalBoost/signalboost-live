create table if not exists public.cos_remediation_memory (
  incident_key text not null check (char_length(incident_key) between 1 and 600),
  remedy_id text not null check (char_length(remedy_id) between 1 and 600),
  verified_successes integer not null default 0 check (verified_successes >= 0),
  verified_failures integer not null default 0 check (verified_failures >= 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  recommendation_eligible boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (incident_key, remedy_id)
);

alter table public.cos_remediation_memory enable row level security;
revoke all on table public.cos_remediation_memory from anon, authenticated;
grant select, insert, update on table public.cos_remediation_memory to service_role;

create index if not exists cos_remediation_memory_eligible_updated_idx
  on public.cos_remediation_memory (recommendation_eligible desc, updated_at desc);

comment on table public.cos_remediation_memory is
  'Verified incident-to-remedy outcome memory. Recommendation evidence only; never authorizes execution, approval, merge, deployment, or policy changes.';
