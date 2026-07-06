-- saas/supabase/migrations/20260706_tts_storage_bucket.sql
-- Ensures the private Supabase Storage bucket used by /api/tts exists.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tts-cache',
  'tts-cache',
  false,
  10485760,
  array['audio/mpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
