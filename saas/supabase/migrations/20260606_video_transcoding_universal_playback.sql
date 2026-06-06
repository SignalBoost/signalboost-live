create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now()
);

insert into public.accounts (id)
select id from auth.users
on conflict (id) do nothing;

create table if not exists public.video_transcodes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  original_filename text not null,
  original_extension text not null,
  original_size_mb integer not null check (original_size_mb >= 0),
  transcoded_filename text,
  transcoded_format text not null default 'mp4',
  transcoded_size_mb integer check (transcoded_size_mb is null or transcoded_size_mb >= 0),
  status text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now()
);

create table if not exists public.video_usage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  subscription_tier text not null check (subscription_tier in ('free','pro','enterprise')),
  quota_mb integer not null check (quota_mb >= 0),
  used_mb integer not null default 0 check (used_mb >= 0),
  overage_charges numeric not null default 0 check (overage_charges >= 0),
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  unique (account_id, subscription_tier)
);

create index if not exists video_transcodes_account_status_idx
  on public.video_transcodes (account_id, status, created_at desc);

create index if not exists video_usage_account_tier_idx
  on public.video_usage (account_id, subscription_tier);

create or replace function public.set_video_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_video_transcodes_updated_at on public.video_transcodes;
create trigger set_video_transcodes_updated_at
before update on public.video_transcodes
for each row execute function public.set_video_updated_at();

drop trigger if exists set_video_usage_updated_at on public.video_usage;
create trigger set_video_usage_updated_at
before update on public.video_usage
for each row execute function public.set_video_updated_at();

alter table public.video_transcodes enable row level security;
alter table public.video_usage enable row level security;

drop policy if exists "video_transcodes account members can read" on public.video_transcodes;
create policy "video_transcodes account members can read"
on public.video_transcodes for select
using (account_id = auth.uid());

drop policy if exists "video_usage account members can read" on public.video_usage;
create policy "video_usage account members can read"
on public.video_usage for select
using (account_id = auth.uid());
