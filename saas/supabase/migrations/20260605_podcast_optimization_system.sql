-- Podcast Optimization System: analyzer audits, recommendations, and rebuild outputs.
create extension if not exists pgcrypto;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp default now()
);

create table if not exists public.podcast_audits (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  feed_url text not null,
  audio_quality_score integer not null default 0 check (audio_quality_score between 0 and 100),
  metadata_score integer not null default 0 check (metadata_score between 0 and 100),
  distribution_score integer not null default 0 check (distribution_score between 0 and 100),
  seo_score integer not null default 0 check (seo_score between 0 and 100),
  accessibility_score integer not null default 0 check (accessibility_score between 0 and 100),
  raw_report jsonb not null default '{}'::jsonb,
  created_at timestamp default now()
);

create table if not exists public.podcast_recommendations (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.podcast_audits(id) on delete cascade,
  category text not null check (category in ('audio', 'metadata', 'distribution', 'seo', 'accessibility')),
  priority text not null check (priority in ('high', 'medium', 'low')),
  recommendation text not null,
  suggested_fix jsonb not null default '{}'::jsonb,
  created_at timestamp default now()
);

create table if not exists public.podcast_rebuilds (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  source_feed text not null,
  status text not null default 'pending' check (status in ('pending','generated','applied')),
  generated_feed jsonb not null default '{}'::jsonb,
  generated_metadata jsonb not null default '{}'::jsonb,
  generated_transcripts jsonb not null default '{}'::jsonb,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create index if not exists podcast_audits_account_created_idx on public.podcast_audits(account_id, created_at desc);
create index if not exists podcast_recommendations_audit_priority_idx on public.podcast_recommendations(audit_id, priority, category);
create index if not exists podcast_rebuilds_account_status_idx on public.podcast_rebuilds(account_id, status, updated_at desc);

create or replace function public.set_podcast_rebuild_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists podcast_rebuilds_set_updated_at on public.podcast_rebuilds;
create trigger podcast_rebuilds_set_updated_at
before update on public.podcast_rebuilds
for each row execute function public.set_podcast_rebuild_updated_at();

alter table public.podcast_audits enable row level security;
alter table public.podcast_recommendations enable row level security;
alter table public.podcast_rebuilds enable row level security;

drop policy if exists "Users can manage own podcast audits" on public.podcast_audits;
create policy "Users can manage own podcast audits"
on public.podcast_audits for all
to authenticated
using (account_id is null or account_id = auth.uid())
with check (account_id is null or account_id = auth.uid());

drop policy if exists "Users can manage recommendations for own podcast audits" on public.podcast_recommendations;
create policy "Users can manage recommendations for own podcast audits"
on public.podcast_recommendations for all
to authenticated
using (exists (select 1 from public.podcast_audits a where a.id = audit_id and (a.account_id is null or a.account_id = auth.uid())))
with check (exists (select 1 from public.podcast_audits a where a.id = audit_id and (a.account_id is null or a.account_id = auth.uid())));

drop policy if exists "Users can manage own podcast rebuilds" on public.podcast_rebuilds;
create policy "Users can manage own podcast rebuilds"
on public.podcast_rebuilds for all
to authenticated
using (account_id is null or account_id = auth.uid())
with check (account_id is null or account_id = auth.uid());
