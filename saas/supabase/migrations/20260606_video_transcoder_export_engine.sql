-- Video transcoder/export engine: queue, storage metadata, quota, and billing support.

create table if not exists public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  source_video text not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  job_type text not null default 'export' check (job_type in ('transcode','caption_burn','export')),
  result_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.video_jobs add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.video_jobs add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.video_jobs add column if not exists source_video text;
alter table public.video_jobs add column if not exists job_type text default 'export';
alter table public.video_jobs add column if not exists result_url text;
alter table public.video_jobs add column if not exists captions_path text;
alter table public.video_jobs add column if not exists rendered_path text;
alter table public.video_jobs add column if not exists transcode_provider text default 'ffmpeg';
alter table public.video_jobs add column if not exists error text;
alter table public.video_jobs add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.video_jobs add column if not exists file_name text;
alter table public.video_jobs add column if not exists file_size bigint;
alter table public.video_jobs add column if not exists langs jsonb default '["en"]'::jsonb;
alter table public.video_jobs add column if not exists formats jsonb default '["srt"]'::jsonb;
alter table public.video_jobs add column if not exists captions jsonb default '[]'::jsonb;
alter table public.video_jobs add column if not exists chapters jsonb default '[]'::jsonb;
alter table public.video_jobs add column if not exists transcript_text text;
alter table public.video_jobs add column if not exists duration_seconds integer;
alter table public.video_jobs add column if not exists plan text;
alter table public.video_jobs add column if not exists completed_at timestamp with time zone;

alter table public.video_jobs drop constraint if exists video_jobs_status_check;
alter table public.video_jobs add constraint video_jobs_status_check check (status in ('queued','processing','completed','failed'));
alter table public.video_jobs drop constraint if exists video_jobs_job_type_check;
alter table public.video_jobs add constraint video_jobs_job_type_check check (job_type in ('transcode','caption_burn','export'));

create index if not exists video_jobs_account_status_idx on public.video_jobs(account_id, status, created_at desc);
create index if not exists video_jobs_user_created_idx on public.video_jobs(user_id, created_at desc);

alter table public.subscriptions add column if not exists video_exports_used integer not null default 0;
alter table public.subscriptions add column if not exists video_export_quota integer;
alter table public.subscriptions add column if not exists video_extra_renders integer not null default 0;
alter table public.subscriptions add column if not exists paypal_customer_id text;

update public.subscriptions
set video_export_quota = case plan
  when 'starter' then 10
  when 'pro' then 40
  when 'business' then 150
  else 0
end
where video_export_quota is null;

create or replace function public.ensure_account_for_user()
returns trigger as $$
begin
  insert into public.accounts (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists ensure_account_for_auth_user on auth.users;
create trigger ensure_account_for_auth_user
  after insert on auth.users
  for each row execute procedure public.ensure_account_for_user();

insert into public.accounts (id)
select id from auth.users
on conflict (id) do nothing;

alter table public.video_jobs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_jobs' and policyname = 'Users can read own video jobs') then
    create policy "Users can read own video jobs"
      on public.video_jobs for select
      using (auth.uid() = user_id or auth.uid() = account_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_jobs' and policyname = 'Users can insert own video jobs') then
    create policy "Users can insert own video jobs"
      on public.video_jobs for insert
      with check (auth.uid() = user_id or auth.uid() = account_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'video_jobs' and policyname = 'Users can update own video jobs') then
    create policy "Users can update own video jobs"
      on public.video_jobs for update
      using (auth.uid() = user_id or auth.uid() = account_id);
  end if;
end $$;
