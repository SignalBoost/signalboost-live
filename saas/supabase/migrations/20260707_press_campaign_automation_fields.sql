alter table public.press_campaigns add column if not exists source text default 'manual_staff';
alter table public.press_campaigns add column if not exists channel text;
alter table public.press_campaigns add column if not exists publication_name text;
alter table public.press_campaigns add column if not exists editor_contact text;
alter table public.press_campaigns add column if not exists headline text;
alter table public.press_campaigns add column if not exists article_notes text;
alter table public.press_campaigns add column if not exists cta_url text;
alter table public.press_campaigns add column if not exists published_url text;
alter table public.press_campaigns add column if not exists preview_sent_at timestamp without time zone;
alter table public.press_campaigns add column if not exists published_at timestamp without time zone;

create index if not exists press_campaigns_source_updated_at_idx on public.press_campaigns (source, updated_at desc);
create index if not exists press_campaigns_channel_updated_at_idx on public.press_campaigns (channel, updated_at desc);
