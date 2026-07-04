-- Add optional geography fields for first-party campaign click tracking.
-- These are populated from Vercel edge request headers when available.

alter table if exists public.cos_campaign_clicks
  add column if not exists country text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists latitude text,
  add column if not exists longitude text,
  add column if not exists timezone text,
  add column if not exists ip_hash text;

create index if not exists idx_cos_campaign_clicks_campaign_country
  on public.cos_campaign_clicks (campaign_id, country);

create index if not exists idx_cos_campaign_clicks_campaign_region
  on public.cos_campaign_clicks (campaign_id, region);

create index if not exists idx_cos_campaign_clicks_campaign_city
  on public.cos_campaign_clicks (campaign_id, city);
