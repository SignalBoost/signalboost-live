-- saas/supabase/migrations/20260802_integration_custom_providers.sql
--
-- BUYER-DECLARED INTEGRATION PROVIDERS.
--
-- The catalog names the tools a buyer most likely already owns — HubSpot, Salesforce,
-- Mailchimp, Brevo, ActiveCampaign, Pipedrive and the rest. It will never name all of
-- them, and a buyer should not be told which CRM or email platform they are allowed to
-- connect. So a provider is a ROW: its id, what it is, how it authenticates, and where
-- its documentation lives.
--
-- Same doctrine as outreach_social_custom_platforms, deliberately: one pattern for
-- "bring your own provider" across the whole product rather than a different mechanism
-- per surface.
--
-- NO SECRETS HERE. Credentials live in the existing connection store, encrypted, exactly
-- as they do for catalog providers. A declaration describes a provider; it never holds
-- the keys to one.
--
-- Safe to run twice.

create table if not exists public.integration_custom_providers (
  id            uuid primary key default gen_random_uuid(),
  provider_id   text not null,
  label         text not null,
  category      text not null,
  auth          text not null default 'api_key',
  auth_url      text,
  token_url     text,
  scopes        text[] not null default '{}',
  docs_url      text,
  capabilities  text[] not null default '{}',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Re-declaring a provider updates it rather than creating a duplicate.
create unique index if not exists integration_custom_providers_id_idx
  on public.integration_custom_providers (provider_id);

alter table public.integration_custom_providers
  drop constraint if exists integration_custom_providers_auth_check;
alter table public.integration_custom_providers
  add constraint integration_custom_providers_auth_check
  check (auth in ('api_key', 'oauth2', 'basic', 'none'));

-- OAuth without an authorize URL cannot complete a connection, so it is refused at the
-- database rather than failing later with a confusing error.
alter table public.integration_custom_providers
  drop constraint if exists integration_custom_providers_oauth_check;
alter table public.integration_custom_providers
  add constraint integration_custom_providers_oauth_check
  check (auth <> 'oauth2' or auth_url is not null);

alter table public.integration_custom_providers enable row level security;

comment on table public.integration_custom_providers is
  'Buyer-declared integration providers. A provider is configuration, not code. Credentials are NOT stored here — they live encrypted in the existing connection store, the same as catalog providers.';
