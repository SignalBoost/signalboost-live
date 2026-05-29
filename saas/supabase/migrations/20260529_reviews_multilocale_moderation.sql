-- Reviews module expansion: multilingual metadata, AI sentiment, moderation, partner/product filters, and media attachments.
alter table public.reviews
  add column if not exists sentiment text not null default 'neutral' check (sentiment in ('positive', 'neutral', 'negative')),
  add column if not exists verified_partner boolean not null default false,
  add column if not exists partner_name text,
  add column if not exists product_name text,
  add column if not exists service_name text,
  add column if not exists media_urls text[] not null default '{}',
  add column if not exists flagged boolean not null default false,
  add column if not exists moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected', 'flagged'));

create index if not exists reviews_owner_language_idx
  on public.reviews (owner_id, language);

create index if not exists reviews_owner_sentiment_idx
  on public.reviews (owner_id, sentiment, created_at desc);

create index if not exists reviews_owner_moderation_idx
  on public.reviews (owner_id, moderation_status, flagged);

create index if not exists reviews_owner_partner_product_idx
  on public.reviews (owner_id, partner_name, product_name, service_name);
