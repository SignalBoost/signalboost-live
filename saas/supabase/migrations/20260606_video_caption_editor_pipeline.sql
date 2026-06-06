create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  source_video text,
  status text not null default 'queued',
  job_type text not null default 'transcode',
  result_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.video_jobs add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.video_jobs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.video_jobs add column if not exists source_video text;
alter table public.video_jobs add column if not exists job_type text not null default 'transcode';
alter table public.video_jobs add column if not exists result_url text;
alter table public.video_jobs add column if not exists queue_payload jsonb not null default '{}'::jsonb;
alter table public.video_jobs add column if not exists result_path text;
alter table public.video_jobs add column if not exists error text;
alter table public.video_jobs add column if not exists file_name text;
alter table public.video_jobs add column if not exists file_size bigint;
alter table public.video_jobs add column if not exists langs text[] not null default array['en'];
alter table public.video_jobs add column if not exists formats text[] not null default array['srt'];
alter table public.video_jobs add column if not exists plan text;
alter table public.video_jobs add column if not exists duration_seconds integer;
alter table public.video_jobs add column if not exists captions jsonb;
alter table public.video_jobs add column if not exists chapters jsonb;
alter table public.video_jobs add column if not exists transcript_text text;
alter table public.video_jobs add column if not exists completed_at timestamptz;
alter table public.video_jobs alter column status set default 'queued';

alter table public.video_jobs drop constraint if exists video_jobs_status_check;
alter table public.video_jobs add constraint video_jobs_status_check check (status in ('queued','processing','completed','failed'));
alter table public.video_jobs drop constraint if exists video_jobs_job_type_check;
alter table public.video_jobs add constraint video_jobs_job_type_check check (job_type in ('transcode','caption_burn','export'));

create table if not exists public.video_storage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade,
  filename text not null,
  size_mb integer not null default 0,
  duration_sec integer not null default 0,
  transcoded boolean not null default false,
  captions jsonb,
  source_path text,
  render_path text,
  created_at timestamptz not null default now()
);

alter table public.video_storage add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.video_storage add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.video_storage add column if not exists source_path text;
alter table public.video_storage add column if not exists render_path text;

create table if not exists public.billing_overage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  provider text not null check (provider in ('stripe','paypal')),
  job_id uuid references public.video_jobs(id) on delete cascade,
  amount_usd numeric(10,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','charged','failed','waived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists video_jobs_user_status_idx on public.video_jobs(user_id, status, created_at desc);
create index if not exists video_jobs_account_status_idx on public.video_jobs(account_id, status, created_at desc);
create index if not exists video_jobs_queue_idx on public.video_jobs(status, job_type, created_at) where status in ('queued','processing');
create index if not exists video_storage_user_created_idx on public.video_storage(user_id, created_at desc);
create index if not exists billing_overage_job_idx on public.billing_overage_events(job_id);

create or replace function public.set_video_job_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_video_jobs_updated_at on public.video_jobs;
create trigger trg_video_jobs_updated_at
before update on public.video_jobs
for each row execute function public.set_video_job_updated_at();

alter table public.video_jobs enable row level security;
alter table public.video_storage enable row level security;
alter table public.billing_overage_events enable row level security;

drop policy if exists "Users read own video jobs" on public.video_jobs;
create policy "Users read own video jobs" on public.video_jobs for select using (auth.uid() = user_id);
drop policy if exists "Users read own video storage" on public.video_storage;
create policy "Users read own video storage" on public.video_storage for select using (auth.uid() = user_id);
drop policy if exists "Users read own billing overages" on public.billing_overage_events;
create policy "Users read own billing overages" on public.billing_overage_events for select using (auth.uid() = user_id);

drop policy if exists "Users insert own video jobs" on public.video_jobs;
create policy "Users insert own video jobs" on public.video_jobs for insert with check (auth.uid() = user_id);
drop policy if exists "Users update own video jobs" on public.video_jobs;
create policy "Users update own video jobs" on public.video_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users insert own video storage" on public.video_storage;
create policy "Users insert own video storage" on public.video_storage for insert with check (auth.uid() = user_id);
drop policy if exists "Users insert own billing overages" on public.billing_overage_events;
create policy "Users insert own billing overages" on public.billing_overage_events for insert with check (auth.uid() = user_id);
