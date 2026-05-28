-- AI Outreach Engine + ADM Console schema

create extension if not exists pgcrypto;

create table if not exists public.outreach_queue (
  id uuid primary key default gen_random_uuid(),
  business_id text,
  source_platform text not null default 'manual',
  business_name text not null,
  business_url text not null,
  analyzer_summary jsonb not null default '{}'::jsonb,
  business_model_profile jsonb not null default '{}'::jsonb,
  predictive_needs jsonb not null default '{}'::jsonb,
  website_json jsonb not null default '{}'::jsonb,
  review_strategy jsonb not null default '{}'::jsonb,
  social_plan jsonb not null default '{}'::jsonb,
  promo_plan jsonb not null default '{}'::jsonb,
  outreach_message text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz
);

create index if not exists outreach_queue_status_created_idx on public.outreach_queue(status, created_at desc);
create index if not exists outreach_queue_business_idx on public.outreach_queue(source_platform, business_id);

create table if not exists public.outreach_sends (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references public.outreach_queue(id) on delete cascade,
  business_id text,
  channel text not null default 'manual',
  sent_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists outreach_sends_sent_at_idx on public.outreach_sends(sent_at desc);
create index if not exists outreach_sends_outreach_idx on public.outreach_sends(outreach_id);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_actor_idx on public.admin_audit_log(actor_id, created_at desc);
create index if not exists admin_audit_log_action_idx on public.admin_audit_log(action, created_at desc);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  ip_address text,
  route_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_idx on public.security_events(created_at desc);
create index if not exists security_events_type_idx on public.security_events(event_type, created_at desc);

create table if not exists public.api_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  route_key text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);

create index if not exists api_rate_limit_events_lookup_idx on public.api_rate_limit_events(route_key, identifier, created_at desc);

create table if not exists public.ai_task_log (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  provider text,
  model text,
  status text not null default 'success' check (status in ('success','error','fallback')),
  duration_ms integer,
  fallback_used boolean not null default false,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_task_log_created_idx on public.ai_task_log(created_at desc);
create index if not exists ai_task_log_status_idx on public.ai_task_log(status, created_at desc);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings(key, value)
values ('outreach_sending_disabled', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists outreach_queue_touch_updated_at on public.outreach_queue;
create trigger outreach_queue_touch_updated_at
before update on public.outreach_queue
for each row execute function public.touch_updated_at();

create or replace function public.is_signalboost_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() ->> 'email') = any(
      string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ',')
    ),
    false
  )
  or exists (
    select 1
    from public.team_members tm
    where (tm.member_id = auth.uid() or tm.owner_id = auth.uid())
      and (tm.status = 'active' or tm.owner_id = auth.uid())
      and (tm.role in ('owner','admin') or tm.owner_id = auth.uid())
  );
$$;

alter table public.outreach_queue enable row level security;
alter table public.outreach_sends enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.security_events enable row level security;
alter table public.api_rate_limit_events enable row level security;
alter table public.ai_task_log enable row level security;
alter table public.system_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_queue' and policyname = 'Admins manage outreach queue') then
    create policy "Admins manage outreach queue" on public.outreach_queue for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_sends' and policyname = 'Admins manage outreach sends') then
    create policy "Admins manage outreach sends" on public.outreach_sends for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_audit_log' and policyname = 'Admins read audit log') then
    create policy "Admins read audit log" on public.admin_audit_log for select using (public.is_signalboost_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'security_events' and policyname = 'Admins read security events') then
    create policy "Admins read security events" on public.security_events for select using (public.is_signalboost_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'api_rate_limit_events' and policyname = 'Admins read rate limit events') then
    create policy "Admins read rate limit events" on public.api_rate_limit_events for select using (public.is_signalboost_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_task_log' and policyname = 'Admins read ai task log') then
    create policy "Admins read ai task log" on public.ai_task_log for select using (public.is_signalboost_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'system_settings' and policyname = 'Admins manage system settings') then
    create policy "Admins manage system settings" on public.system_settings for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
end $$;
