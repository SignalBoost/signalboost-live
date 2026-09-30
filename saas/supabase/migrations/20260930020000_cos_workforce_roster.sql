-- WORKFORCE (owner direction 2026-09-29): "they cannot be in the university". A graduate leaves the University at
-- graduation and is hired into the Workforce. The University keeps only the diploma record
-- (cos_university_graduate_model_registry: exam evidence, promotion, rollback, serving proof). COS hires its
-- workers from this roster, not from the University.
--
-- Hiring and retiring are automatic and follow the diploma record exactly:
--   graduate becomes 'active'            -> hired, status 'on_call' (asleep on RunPod, ready to be called)
--   graduate leaves 'active' (quarantined, retired, recertification) -> worker 'retired', never called again
-- Every safety gate stays on the diploma record; a roster row alone can never make a model callable.
-- No URL or secret is stored here. authority_expanded is always false.

create table if not exists public.cos_workforce_roster (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null unique references public.cos_university_graduate_model_registry(id),
  candidate_id text not null,
  trained_artifact_hash text not null,
  specialty text not null,
  job_roles jsonb not null default '[]'::jsonb check (jsonb_typeof(job_roles) = 'array'),
  problem_classes jsonb not null default '[]'::jsonb check (jsonb_typeof(problem_classes) = 'array'),
  runtime_provider text,
  runtime_model_id text,
  status text not null default 'on_call' check (status in ('on_call', 'retired')),
  hired_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_reason text,
  updated_at timestamptz not null default now(),
  authority_expanded boolean not null default false check (authority_expanded = false),
  check (status <> 'retired' or retired_at is not null)
);

create index if not exists cos_workforce_roster_on_call_idx
  on public.cos_workforce_roster (status, specialty, hired_at desc);

alter table public.cos_workforce_roster enable row level security;
revoke all on table public.cos_workforce_roster from public, anon, authenticated;
grant select, insert, update on table public.cos_workforce_roster to service_role;

comment on table public.cos_workforce_roster is
  'Graduates hired out of COS University. COS selects workers from on_call rows; the University registry keeps the diploma and every serving gate. Grants no authority.';

-- Hire on activation, retire on departure. The diploma record is the only writer: a roster failure is logged
-- as a warning and can never block or roll back a University activation, quarantine or retirement.
create or replace function public.cos_workforce_follow_graduate_registry()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  begin
    if new.status = 'active' then
      insert into public.cos_workforce_roster as roster (
        registry_id, candidate_id, trained_artifact_hash, specialty, job_roles, problem_classes,
        runtime_provider, runtime_model_id, status, hired_at, retired_at, retired_reason, updated_at
      ) values (
        new.id,
        new.candidate_id,
        lower(new.trained_artifact_hash),
        new.subject_id,
        case when jsonb_typeof(new.platform_scope->'workerRoles') = 'array' then new.platform_scope->'workerRoles' else '[]'::jsonb end,
        case when jsonb_typeof(new.platform_scope->'problemClasses') = 'array' then new.platform_scope->'problemClasses' else '[]'::jsonb end,
        new.runtime_provider,
        new.runtime_model_id,
        'on_call',
        coalesce(new.activated_at, now()),
        null,
        null,
        now()
      )
      on conflict (registry_id) do update set
        job_roles = excluded.job_roles,
        problem_classes = excluded.problem_classes,
        runtime_provider = excluded.runtime_provider,
        runtime_model_id = excluded.runtime_model_id,
        hired_at = case when roster.status = 'retired' then excluded.hired_at else roster.hired_at end,
        status = 'on_call',
        retired_at = null,
        retired_reason = null,
        updated_at = now();
    elsif tg_op = 'UPDATE' and old.status = 'active' then
      update public.cos_workforce_roster
        set status = 'retired',
            retired_at = now(),
            retired_reason = 'graduate_registry_' || coalesce(new.status, 'unknown'),
            updated_at = now()
        where registry_id = new.id and status = 'on_call';
    end if;
  exception when others then
    raise warning 'cos_workforce_roster sync skipped for graduate %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.cos_workforce_follow_graduate_registry() from public, anon, authenticated;

drop trigger if exists cos_workforce_follow_graduate_registry on public.cos_university_graduate_model_registry;
create trigger cos_workforce_follow_graduate_registry
after insert or update of status, platform_scope, runtime_provider, runtime_model_id
on public.cos_university_graduate_model_registry
for each row execute function public.cos_workforce_follow_graduate_registry();

-- Hire the graduates already active today (the six on RunPod as of 2026-09-29).
insert into public.cos_workforce_roster (
  registry_id, candidate_id, trained_artifact_hash, specialty, job_roles, problem_classes,
  runtime_provider, runtime_model_id, status, hired_at, updated_at
)
select
  g.id,
  g.candidate_id,
  lower(g.trained_artifact_hash),
  g.subject_id,
  case when jsonb_typeof(g.platform_scope->'workerRoles') = 'array' then g.platform_scope->'workerRoles' else '[]'::jsonb end,
  case when jsonb_typeof(g.platform_scope->'problemClasses') = 'array' then g.platform_scope->'problemClasses' else '[]'::jsonb end,
  g.runtime_provider,
  g.runtime_model_id,
  'on_call',
  coalesce(g.activated_at, now()),
  now()
from public.cos_university_graduate_model_registry g
where g.status = 'active'
on conflict (registry_id) do nothing;
