-- saas/marketing-sales-core/migration-video.sql
-- Video production bookkeeping for ms_drafts. asset_url + asset_status already
-- exist (from the scaffold migration); we only add the provider handles needed to
-- poll an async render. Idempotent and safe to re-run.
alter table public.ms_drafts add column if not exists video_request_id text;
alter table public.ms_drafts add column if not exists video_model      text;
