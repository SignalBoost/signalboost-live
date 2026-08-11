create table if not exists public.cos_runpod_runtime (
  singleton boolean primary key default true check (singleton),
  active_requests integer not null default 0 check (active_requests >= 0),
  last_activity_at timestamptz not null default now(),
  lifecycle_state text not null default 'idle' check (lifecycle_state in ('idle','active','stopping','stopped')),
  updated_at timestamptz not null default now()
);

insert into public.cos_runpod_runtime (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.cos_runpod_runtime enable row level security;
revoke all on public.cos_runpod_runtime from anon, authenticated;

create or replace function public.cos_runpod_activity_begin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cos_runpod_runtime(singleton, active_requests, last_activity_at, lifecycle_state, updated_at)
  values (true, 1, now(), 'active', now())
  on conflict (singleton) do update
    set active_requests = public.cos_runpod_runtime.active_requests + 1,
        last_activity_at = now(),
        lifecycle_state = 'active',
        updated_at = now();
end;
$$;

create or replace function public.cos_runpod_activity_end()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cos_runpod_runtime
     set active_requests = greatest(active_requests - 1, 0),
         last_activity_at = now(),
         lifecycle_state = case when greatest(active_requests - 1, 0) = 0 then 'idle' else 'active' end,
         updated_at = now()
   where singleton = true;
end;
$$;

create or replace function public.cos_runpod_claim_idle_stop(idle_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer;
begin
  update public.cos_runpod_runtime
     set lifecycle_state = 'stopping', updated_at = now()
   where singleton = true
     and active_requests = 0
     and lifecycle_state in ('idle','active')
     and last_activity_at <= now() - make_interval(secs => greatest(idle_seconds, 60));
  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;

create or replace function public.cos_runpod_mark_stopped()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cos_runpod_runtime
     set lifecycle_state = 'stopped', updated_at = now()
   where singleton = true;
end;
$$;

create or replace function public.cos_runpod_release_stop_claim()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cos_runpod_runtime
     set lifecycle_state = case when active_requests > 0 then 'active' else 'idle' end,
         updated_at = now()
   where singleton = true and lifecycle_state = 'stopping';
end;
$$;

revoke all on function public.cos_runpod_activity_begin() from public;
revoke all on function public.cos_runpod_activity_end() from public;
revoke all on function public.cos_runpod_claim_idle_stop(integer) from public;
revoke all on function public.cos_runpod_mark_stopped() from public;
revoke all on function public.cos_runpod_release_stop_claim() from public;
grant execute on function public.cos_runpod_activity_begin() to service_role;
grant execute on function public.cos_runpod_activity_end() to service_role;
grant execute on function public.cos_runpod_claim_idle_stop(integer) to service_role;
grant execute on function public.cos_runpod_mark_stopped() to service_role;
grant execute on function public.cos_runpod_release_stop_claim() to service_role;
