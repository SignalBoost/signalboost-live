-- saas/supabase/migrations/20260629_social_account_ref.sql
-- Destination handle for real multi-platform publishing. The OAuth connect flow
-- (or a manual entry) stores which page / organization / IG account a connected
-- token publishes to. YouTube and X do not require it. Idempotent.
alter table public.outreach_social_tokens add column if not exists account_ref  text;
alter table public.outreach_social_tokens add column if not exists account_name text;
