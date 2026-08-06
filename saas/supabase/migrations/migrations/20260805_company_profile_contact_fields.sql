-- saas/supabase/migrations/20260805_company_profile_contact_fields.sql
--
-- DATELINE CITY AND THE MEDIA CONTACT BLOCK.
--
-- Also missing from the repo. Kept as a separate migration rather than folded into
-- 20260805_company_profile_tables.sql because a database provisioned before that date
-- already has the tables without these columns, and it must be able to catch up.
-- Both files are idempotent, so applying either, both, or the same one twice is safe.
--
-- THE SPOKESPERSON AND THE MEDIA CONTACT ARE DELIBERATELY DIFFERENT PEOPLE.
-- The spokesperson is quoted INSIDE the story. The media contact ANSWERS QUESTIONS about
-- it and appears in the contact block at the foot. Collapsing the two is how a release
-- ends up quoting the press office or listing the CEO's direct line for fact-checking.
-- A media contact may be a team ("SignalBoost Press Office"); a quote may not — editors
-- cut unattributed quotes, so no spokesperson means the quote paragraph is omitted
-- entirely rather than attributed to a department.
--
-- dateline_city exists because a release opens "CITY, Date —". Without it the generator
-- was emitting a literal [CITY] placeholder into copy intended for editors.

alter table if exists public.press_company_profile
  add column if not exists dateline_city       text,
  add column if not exists media_contact_name  text,
  add column if not exists media_contact_title text,
  add column if not exists media_contact_email text,
  add column if not exists media_contact_phone text;

alter table if exists public.user_company_profile
  add column if not exists dateline_city       text,
  add column if not exists media_contact_name  text,
  add column if not exists media_contact_title text,
  add column if not exists media_contact_email text,
  add column if not exists media_contact_phone text;

comment on column public.press_company_profile.dateline_city is
  'City for the release dateline ("CITY, Date —"). Absent, the generator emits a visible gap, never a guess.';
comment on column public.press_company_profile.media_contact_email is
  'Answers editor questions. NOT the spokesperson, who is quoted in the story body.';
