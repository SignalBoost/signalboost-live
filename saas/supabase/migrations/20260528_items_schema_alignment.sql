create extension if not exists pgcrypto;

alter table if exists items
  add column if not exists title text,
  add column if not exists query text,
  add column if not exists category text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists source_url text,
  add column if not exists description text,
  add column if not exists image_url text;

update items
set title = coalesce(title, name, 'Unknown Item')
where title is null;

update items
set query = coalesce(query, 'demo')
where query is null;

alter table items
  alter column title set not null,
  alter column query set not null;

create unique index if not exists idx_items_title_source_url_unique on items(title, source_url);
