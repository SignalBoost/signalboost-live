create table if not exists public.press_campaigns (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'pending_owner_review', 'approved', 'published', 'rejected')),
  created_by_role text not null check (created_by_role in ('owner', 'staff')),
  media_target_type text not null check (media_target_type in ('newspaper_print', 'magazine_print', 'digital_press')),
  publication_contact text not null,
  content_body text not null,
  processing_state text not null default 'free_organic_distribution' check (processing_state = 'free_organic_distribution'),
  updated_at timestamp without time zone not null default now()
);

create index if not exists press_campaigns_status_updated_at_idx on public.press_campaigns (status, updated_at desc);
create index if not exists press_campaigns_updated_at_idx on public.press_campaigns (updated_at desc);

create or replace function public.set_press_campaigns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists press_campaigns_set_updated_at on public.press_campaigns;
create trigger press_campaigns_set_updated_at
before update on public.press_campaigns
for each row
execute function public.set_press_campaigns_updated_at();
