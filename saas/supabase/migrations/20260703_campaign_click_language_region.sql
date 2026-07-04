alter table if exists public.cos_campaign_clicks
  add column if not exists language text,
  add column if not exists target_region text;

create index if not exists idx_cos_campaign_clicks_campaign_language
  on public.cos_campaign_clicks (campaign_id, language);

create index if not exists idx_cos_campaign_clicks_campaign_target_region
  on public.cos_campaign_clicks (campaign_id, target_region);
