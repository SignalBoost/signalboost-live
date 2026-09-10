-- Independent delayed-retention evidence. Replays a previously passed hidden transfer case only
-- after a fixed delay; it cannot manufacture a new held-out variant or bypass Production evidence.

alter table public.cos_university_assessments
  drop constraint if exists cos_university_assessments_assessment_kind_check;
alter table public.cos_university_assessments
  add constraint cos_university_assessments_assessment_kind_check check (assessment_kind in (
    'diagnostic','practice_checkpoint','unseen_subject_exam','cross_domain_transfer',
    'delayed_retention','production_transfer','capstone'
  ));

create table if not exists public.cos_university_retention_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  agent_id text not null default 'cos',
  subject_id text not null,
  source_run_id uuid not null references public.cos_university_a_range_runs(id),
  profile text not null,
  scorer_version text not null,
  source_manifest_hash text not null,
  status text not null default 'created' check (status in ('created','running','passed','failed','error')),
  passed boolean,
  turn_id uuid,
  reasons text[] not null default '{}'::text[],
  observed_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_run_id),
  check ((status in ('passed','failed') and passed is not null) or status not in ('passed','failed'))
);

create index if not exists cos_university_retention_subject_idx
  on public.cos_university_retention_runs(agent_id, subject_id, observed_at desc);
alter table public.cos_university_retention_runs enable row level security;
revoke all on table public.cos_university_retention_runs from anon, authenticated;
grant select, insert, update on table public.cos_university_retention_runs to service_role;
