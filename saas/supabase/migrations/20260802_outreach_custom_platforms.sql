-- saas/supabase/migrations/20260802_outreach_custom_platforms.sql
--
-- BUYER-DECLARED SOCIAL PLATFORMS.
--
-- The eight built-in connectors are conveniences, not the boundary of the product. There
-- are far more platforms than any vendor can keep adapters for, and a buyer should never
-- be told which ones they are allowed to publish to. So a platform is a ROW: where to
-- authorize, where to exchange the token, what the publish request looks like, and where
-- the post id or permalink appears in the response.
--
-- Adding a platform therefore needs no code change, no release, and no vendor involvement.
--
-- WHAT A ROW CANNOT DO. A declared platform runs the identical publish path as a built-in
-- one: the same "reported published only when the provider confirms it" rule, the same
-- human approval gate upstream, the same credential resolver. This table adds reach, never
-- authority.
--
-- No secrets live here. Client ids and secrets stay in the environment or the buyer's
-- vault under the connector's usual SOCIAL_<PLATFORM>_CLIENT_ID / _CLIENT_SECRET names —
-- a config row that carried credentials would put them in a place a buyer's security
-- review has not approved.
--
-- Safe to run twice.

create table if not exists public.outreach_social_custom_platforms (
  id                  uuid primary key default gen_random_uuid(),
  -- Stable identifier used everywhere the platform is referenced, e.g. 'bluesky'.
  platform_id         text not null,
  label               text not null,

  -- OAuth
  auth_url            text not null,
  token_url           text,
  scopes              text[] not null default '{}',

  -- Publishing. body_kind is 'json' | 'form' | 'text'; body_template holds the request
  -- shape with {text} / {videoUrl} / {imageUrl} / {accountRef} placeholders.
  publish_url         text not null,
  method              text not null default 'POST',
  headers             jsonb not null default '{}'::jsonb,
  body_kind           text not null default 'json',
  body_template       jsonb not null default '{}'::jsonb,

  -- Reading the response. At least one of id_path / id_header / url_path must be set, or
  -- a post could never be confirmed — enforced below rather than left to the caller.
  id_path             text,
  id_header           text,
  url_path            text,
  permalink_template  text,

  -- Shape
  content             text not null default 'text',
  needs_account_ref   boolean not null default false,

  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One declaration per platform id, per owner. Re-declaring updates rather than duplicates.
create unique index if not exists outreach_social_custom_platforms_id_idx
  on public.outreach_social_custom_platforms (platform_id);

alter table public.outreach_social_custom_platforms
  drop constraint if exists outreach_social_custom_platforms_body_kind_check;
alter table public.outreach_social_custom_platforms
  add constraint outreach_social_custom_platforms_body_kind_check
  check (body_kind in ('json', 'form', 'text'));

alter table public.outreach_social_custom_platforms
  drop constraint if exists outreach_social_custom_platforms_content_check;
alter table public.outreach_social_custom_platforms
  add constraint outreach_social_custom_platforms_content_check
  check (content in ('text', 'video', 'media'));

alter table public.outreach_social_custom_platforms
  drop constraint if exists outreach_social_custom_platforms_method_check;
alter table public.outreach_social_custom_platforms
  add constraint outreach_social_custom_platforms_method_check
  check (method in ('POST', 'PUT', 'PATCH'));

-- A platform that cannot confirm a published post has no business being registered.
alter table public.outreach_social_custom_platforms
  drop constraint if exists outreach_social_custom_platforms_confirmable_check;
alter table public.outreach_social_custom_platforms
  add constraint outreach_social_custom_platforms_confirmable_check
  check (id_path is not null or id_header is not null or url_path is not null);

-- Service-role only, like every other outreach table: reads and writes go through an
-- owner-gated route, never the browser.
alter table public.outreach_social_custom_platforms enable row level security;

comment on table public.outreach_social_custom_platforms is
  'Buyer-declared social platforms. A platform is configuration, not code: adding one needs no release. Credentials are NOT stored here — they stay in the environment or the buyer vault under SOCIAL_<PLATFORM_ID>_CLIENT_ID / _CLIENT_SECRET.';
