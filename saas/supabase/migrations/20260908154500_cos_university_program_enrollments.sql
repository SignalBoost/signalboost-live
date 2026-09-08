create table if not exists public.cos_university_program_enrollments (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null default 'cos',
  program_key text not null,
  program_level text not null check (program_level in ('undergraduate','masters','phd','professional_certificate')),
  enrolled_at timestamptz not null,
  minimum_residence_until timestamptz not null,
  target_completion_at timestamptz not null,
  hard_deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, program_key),
  constraint cos_university_program_time_order check (
    enrolled_at < minimum_residence_until
    and minimum_residence_until <= target_completion_at
    and target_completion_at < hard_deadline_at
  )
);

create index if not exists cos_university_program_enrollments_agent_level_idx
  on public.cos_university_program_enrollments (agent_id, program_level, enrolled_at desc);

alter table public.cos_university_program_enrollments enable row level security;
revoke all on table public.cos_university_program_enrollments from anon, authenticated;
grant select, insert, update, delete on table public.cos_university_program_enrollments to service_role;

comment on table public.cos_university_program_enrollments is
  'Time-bounded University program enrollment. Competence is evaluated elsewhere; this table defines the academic calendar and prevents indefinite enrollment.';

-- Bootstrap the current COS undergraduate cohort from the first durable University assessment when available.
-- This does not backfill academic credit; it only anchors the program calendar to the actual start of formal assessment.
with first_university_event as (
  select coalesce(
    (select min(observed_at) from public.cos_university_assessments where agent_id = 'cos'),
    now()
  ) as enrolled_at
)
insert into public.cos_university_program_enrollments (
  agent_id,
  program_key,
  program_level,
  enrolled_at,
  minimum_residence_until,
  target_completion_at,
  hard_deadline_at
)
select
  'cos',
  'generalist_undergraduate_v1',
  'undergraduate',
  enrolled_at,
  enrolled_at + interval '60 days',
  enrolled_at + interval '120 days',
  enrolled_at + interval '180 days'
from first_university_event
on conflict (agent_id, program_key) do nothing;
