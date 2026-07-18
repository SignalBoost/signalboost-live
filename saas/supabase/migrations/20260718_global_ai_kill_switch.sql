-- Global AI Kill Switch
-- A singleton fail-safe flag read by Edge Middleware before autonomous ingress.

create table if not exists public.system_status (
  id text primary key default 'global' check (id = 'global'),
  ai_autonomous_execution_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.system_status (id, ai_autonomous_execution_enabled)
values ('global', true)
on conflict (id) do nothing;

alter table public.system_status enable row level security;

drop policy if exists "Anyone can read global AI execution status" on public.system_status;
create policy "Anyone can read global AI execution status"
  on public.system_status for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins manage global AI execution status" on public.system_status;
create policy "Admins manage global AI execution status"
  on public.system_status for all
  to authenticated
  using (public.is_signalboost_admin())
  with check (public.is_signalboost_admin());

comment on table public.system_status is 'Singleton global controls. ai_autonomous_execution_enabled is the Mission 001 emergency ingress kill switch for autonomous AI, webhook, and cron execution.';
