create extension if not exists pgcrypto;

create table if not exists public.cos_video_review_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.cos_campaign_queue(id) on delete cascade,
  title text not null,
  description text not null,
  tags jsonb not null default '[]'::jsonb,
  video_asset_url text,
  video_asset_path text,
  external_video_id text,
  status text not null default 'waiting_approval' check (status in ('draft','waiting_approval','approved','processing','ready','scheduled','done','rejected','failed')),
  approval_required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz
);

create index if not exists cos_video_review_queue_status_idx on public.cos_video_review_queue(status, created_at desc);
create index if not exists cos_video_review_queue_campaign_idx on public.cos_video_review_queue(campaign_id);

drop trigger if exists cos_video_review_queue_touch_updated_at on public.cos_video_review_queue;
create trigger cos_video_review_queue_touch_updated_at
before update on public.cos_video_review_queue
for each row execute function public.touch_updated_at();

alter table public.cos_video_review_queue enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cos_video_review_queue' and policyname = 'Admins manage cos video review queue') then
    create policy "Admins manage cos video review queue" on public.cos_video_review_queue for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
end $$;
