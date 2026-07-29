-- Durable per-user language copies for generated reports and documents.
-- Original source content remains in its owning feature table; this table stores
-- only a source hash and the translated display payload.

create table if not exists public.generated_content_translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_hash text not null,
  source_language text not null check (source_language in ('en', 'es', 'pt', 'pl', 'ru')),
  target_language text not null check (target_language in ('en', 'es', 'pt', 'pl', 'ru')),
  content_kind text not null default 'generated-content',
  translated_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_hash, target_language)
);

create index if not exists generated_content_translations_user_updated_idx
  on public.generated_content_translations (user_id, updated_at desc);

alter table public.generated_content_translations enable row level security;

drop policy if exists generated_content_translations_select_own
  on public.generated_content_translations;
create policy generated_content_translations_select_own
  on public.generated_content_translations
  for select
  using (auth.uid() = user_id);

drop policy if exists generated_content_translations_insert_own
  on public.generated_content_translations;
create policy generated_content_translations_insert_own
  on public.generated_content_translations
  for insert
  with check (auth.uid() = user_id);

drop policy if exists generated_content_translations_update_own
  on public.generated_content_translations;
create policy generated_content_translations_update_own
  on public.generated_content_translations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.generated_content_translations is
  'Per-user cached language copies of generated reports, documents, narratives, and other free text. Original content is never overwritten.';
