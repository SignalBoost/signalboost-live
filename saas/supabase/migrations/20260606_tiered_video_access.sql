-- Tiered video access, quota usage, and playback/storage audit tables.

create table if not exists public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

insert into public.accounts (id)
select id from auth.users
on conflict (id) do nothing;

create table if not exists public.video_usage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro', 'enterprise')),
  quota_mb integer not null default 10 check (quota_mb >= 0),
  used_mb integer not null default 0 check (used_mb >= 0),
  overage_charges numeric not null default 0 check (overage_charges >= 0),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique (account_id)
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  filename text not null,
  size_mb integer not null check (size_mb >= 0),
  duration_sec integer not null check (duration_sec >= 0),
  status text not null check (status in ('demo', 'full', 'blocked')),
  created_at timestamp with time zone default now()
);

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_size bigint not null default 0,
  langs text[] not null default array['en'],
  formats text[] not null default array['srt'],
  status text not null default 'uploading',
  plan text not null default 'free',
  access_status text check (access_status in ('demo', 'full', 'blocked')),
  duration_seconds integer,
  captions jsonb,
  chapters jsonb,
  transcript_text text,
  error text,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.video_jobs
  add column if not exists access_status text check (access_status in ('demo', 'full', 'blocked'));

create index if not exists idx_video_usage_account on public.video_usage(account_id);
create index if not exists idx_videos_account_created on public.videos(account_id, created_at desc);
create index if not exists idx_video_jobs_user_created on public.video_jobs(user_id, created_at desc);

alter table public.accounts enable row level security;
alter table public.video_usage enable row level security;
alter table public.videos enable row level security;
alter table public.video_jobs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'accounts' and policyname = 'Users can view own account') then
    create policy "Users can view own account" on public.accounts for select using (auth.uid() = id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_usage' and policyname = 'Users can view own video usage') then
    create policy "Users can view own video usage" on public.video_usage for select using (auth.uid() = account_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'videos' and policyname = 'Users can view own videos') then
    create policy "Users can view own videos" on public.videos for select using (auth.uid() = account_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_jobs' and policyname = 'Users can view own video jobs') then
    create policy "Users can view own video jobs" on public.video_jobs for select using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.ensure_video_account()
returns trigger as $$
begin
  insert into public.accounts (id) values (new.id) on conflict (id) do nothing;
  insert into public.video_usage (account_id, subscription_tier, quota_mb, used_mb, overage_charges)
  values (new.id, 'free', 10, 0, 0)
  on conflict (account_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_video_account
  after insert on auth.users
  for each row execute procedure public.ensure_video_account();
