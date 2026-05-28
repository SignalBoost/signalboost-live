create unique index if not exists idx_items_source_url_unique
  on items (source_url)
  where source_url is not null;
