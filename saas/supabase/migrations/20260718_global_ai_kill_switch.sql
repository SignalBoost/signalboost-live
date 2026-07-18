-- One globally-scoped, fail-safe control for autonomous AI ingress.
create table if not exists public.system_status (
  id text primary key default 'global' check (id = 'global'),
  ai_autonomous_execution_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.system_status (id, ai_autonomous_execution_enabled)
values ('global', true)
on conflict (id) do nothing;

create or replace function public.is_system_status_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.team_members
      where owner_id = auth.uid()
        and status in ('active', 'pending')
    )
    or exists (
      select 1 from public.team_members
      where member_id = auth.uid()
        and role in ('owner', 'admin')
        and status in ('active', 'pending')
    )
  );
$$;

alter table public.system_status enable row level security;

create policy "Authenticated users can read global system status"
  on public.system_status for select
  to anon, authenticated
  using (true);

create policy "Only owners and admins can update global system status"
  on public.system_status for update
  to authenticated
  using (public.is_system_status_admin())
  with check (public.is_system_status_admin());

revoke insert, delete on public.system_status from authenticated;
grant select on public.system_status to anon, authenticated;
grant update on public.system_status to authenticated;

create or replace function public.set_system_status_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists system_status_set_updated_at on public.system_status;
create trigger system_status_set_updated_at
before update on public.system_status
for each row execute function public.set_system_status_updated_at();
