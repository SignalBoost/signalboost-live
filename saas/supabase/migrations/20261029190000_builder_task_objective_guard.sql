-- Phase 1 of the canonical customer task record integration.
-- Protect the original customer request against both application and RPC rewrites.
-- Keep Builder's existing claim/checkpoint/lease semantics unchanged.
alter table public.builder_jobs
  add column if not exists plan_version bigint not null default 1;

alter table public.builder_jobs
  drop constraint if exists builder_jobs_plan_version_positive;
alter table public.builder_jobs
  add constraint builder_jobs_plan_version_positive check (plan_version >= 1);

create or replace function public.guard_builder_job_immutable_objective()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.objective is distinct from old.objective then
    raise exception 'builder_job_objective_immutable' using errcode = '23514';
  end if;
  if new.user_id is distinct from old.user_id
     or new.conversation_id is distinct from old.conversation_id
     or new.workspace_id is distinct from old.workspace_id
     or new.job_kind is distinct from old.job_kind then
    raise exception 'builder_job_identity_immutable' using errcode = '23514';
  end if;
  if new.plan_version < old.plan_version then
    raise exception 'builder_job_plan_version_regression' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists builder_job_immutable_identity_guard on public.builder_jobs;
create trigger builder_job_immutable_identity_guard
before update on public.builder_jobs
for each row
execute function public.guard_builder_job_immutable_objective();

comment on column public.builder_jobs.plan_version is
  'Monotonic plan revision; replanning must preserve objective, user, workspace, and authority.';
