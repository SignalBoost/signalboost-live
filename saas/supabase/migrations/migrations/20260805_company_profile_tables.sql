-- saas/supabase/migrations/20260805_company_profile_tables.sql
--
-- THE TABLES THE COMPANY-FACTS CODE HAS ALWAYS READ AND WRITTEN, AND WHICH NO MIGRATION
-- IN THIS REPO EVER CREATED.
--
-- Shipped code depends on both: lib/portable/companyIdentity.ts reads them,
-- app/api/account/company-profile/route.ts and app/api/agency/press-media/route.ts write
-- them, lib/ai/tools/companyFacts.ts exposes them to the agent. The repo's own
-- 20260726_schema_drift_audit.sql already recorded the gap on lines 94 and 101 —
-- '(no migration in repo)' for both — and it went unactioned.
--
-- The consequence was not a crash: the readers swallow the error and return null, so the
-- cockpit said "No facts saved yet" and the agent said "the record is empty". Both read as
-- "nobody filled this in" when the truth was "there is nowhere to put it".
--
-- WHY IT MATTERS BEYOND THIS INSTALL: a buyer provisioning this portable applies the
-- migrations and gets code that reads tables which do not exist, reporting an empty
-- company record it can never fill. Schema that lives only in one person's Supabase
-- console is not plug-and-play.
--
-- Idempotent — safe to run against a database where these were already created by hand.

create extension if not exists "pgcrypto";

-- ── press_company_profile: EXACTLY ONE ROW, enforced by the database ──────────────────
-- The operator's own company record used to generate press releases. The application
-- upserts with onConflict:'singleton', so "there is only one" has to be a schema
-- guarantee rather than a convention the callers remember to honour.
create table if not exists public.press_company_profile (
  singleton            boolean primary key default true,
  legal_name           text,
  brand_name           text,
  website              text,
  products             text,
  boilerplate          text,
  spokesperson_name    text,
  spokesperson_title   text,
  approved_quote       text,
  permitted_claims     text,
  forbidden_claims     text,
  dateline_city        text,
  media_contact_name   text,
  media_contact_title  text,
  media_contact_email  text,
  media_contact_phone  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint press_company_profile_singleton_true check (singleton is true)
);

-- ── user_company_profile: one row per user ───────────────────────────────────────────
-- A customer's OWN company facts. Deliberately separate from the table above: user content
-- must carry THEIR company or a visible gap, never silently inherit the operator's brand.
create table if not exists public.user_company_profile (
  user_id              uuid primary key,
  legal_name           text,
  brand_name           text,
  website              text,
  products             text,
  boilerplate          text,
  spokesperson_name    text,
  spokesperson_title   text,
  approved_quote       text,
  permitted_claims     text,
  forbidden_claims     text,
  dateline_city        text,
  media_contact_name   text,
  media_contact_title  text,
  media_contact_email  text,
  media_contact_phone  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────────────
-- Enabled with NO permissive policy for the anon role. Both tables are reached only
-- through the service-role client on the server, which bypasses RLS. Enabling it without
-- a policy is therefore the correct closed default: an anon key cannot read either table.
alter table public.press_company_profile enable row level security;
alter table public.user_company_profile  enable row level security;

comment on table public.press_company_profile is
  'Operator company facts for press generation. Exactly one row (singleton PK + check).';
comment on table public.user_company_profile is
  'Per-user company facts. Never fall back to the operator brand for user content.';
