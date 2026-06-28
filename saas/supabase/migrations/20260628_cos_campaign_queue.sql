-- COS Campaign Queue
-- Converts approved COS recommendations into reviewable campaign work.

create extension if not exists pgcrypto;

-- Some deployments may not have run the older outreach ADM migration yet.
-- Keep this migration self-contained by creating the shared helpers it needs.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_signalboost_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role() = 'service_role', false)
  or coalesce(
    (auth.jwt() ->> 'email') = any(
      string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ',')
    ),
    false
  );
$$;

create table if not exists public.cos_campaign_queue (
  id uuid primary key default gen_random_uuid(),
  recommendation_id text not null,
  department text not null default 'marketing',
  title text not null,
  objective text not null,
  channel text not null,
  audience text not null,
  languages jsonb not null default '[]'::jsonb,
  assets jsonb not null default '[]'::jsonb,
  work_items jsonb not null default '[]'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  status text not null default 'waiting_approval' check (status in ('draft','waiting_approval','approved','queued','running','completed','measured','learned','rejected')),
  risk_level text not null default 'medium' check (risk_level in ('low','medium','high')),
  approval_required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz
);

create index if not exists cos_campaign_queue_status_created_idx on public.cos_campaign_queue(status, created_at desc);
create index if not exists cos_campaign_queue_recommendation_idx on public.cos_campaign_queue(recommendation_id);
create index if not exists cos_campaign_queue_department_idx on public.cos_campaign_queue(department, created_at desc);

drop trigger if exists cos_campaign_queue_touch_updated_at on public.cos_campaign_queue;
create trigger cos_campaign_queue_touch_updated_at
before update on public.cos_campaign_queue
for each row execute function public.touch_updated_at();

alter table public.cos_campaign_queue enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cos_campaign_queue' and policyname = 'Admins manage cos campaign queue') then
    create policy "Admins manage cos campaign queue" on public.cos_campaign_queue for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
end $$;
