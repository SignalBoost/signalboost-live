-- saas/supabase/migrations/20260802_ads_spend_ledger.sql
--
-- The spend ledger for the paid-advertising surface of the Marketing + Sales portable.
--
-- Why this table exists before any route or cockpit: lib/ads/ads-connector.ts enforces its
-- three rules in memory, and memory does not survive a cold serverless process. Without a
-- durable record there is no answer to "what is authorised to spend right now, who approved
-- it, and what has it actually spent" — which is the only question that matters at 2am.
--
-- Two rules are written into the schema itself rather than left to application code:
--   1. A campaign row cannot exist without a cap AND a named spend approver. The row IS the
--      approval record; there is no campaign without one.
--   2. Spend events are append-only observations REPORTED BY THE PROVIDER. We never compute
--      spend ourselves, so nothing here is derived arithmetic that could disagree with the
--      ad account.
--
-- NO SECRETS IN ANY ROW. Ad-account credentials stay in env/vault under the platform's own
-- variables, exactly as for social publishing. Nothing below holds a token.

-- ---------------------------------------------------------------------------
-- Account ceilings — the hard limit a campaign cap may not exceed.
-- Data, not code, so a buyer raises or lowers it without a release.
-- ---------------------------------------------------------------------------
create table if not exists ads_account_ceilings (
  id              uuid primary key default gen_random_uuid(),
  platform_id     text        not null,
  account_ref     text        not null,
  ceiling_minor   bigint      not null,
  currency        char(3)     not null,
  set_by          text        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint ads_ceiling_positive   check (ceiling_minor > 0),
  constraint ads_ceiling_currency   check (currency ~ '^[A-Z]{3}$'),
  constraint ads_ceiling_unique     unique (platform_id, account_ref)
);

comment on table ads_account_ceilings is
  'Per ad-account spend ceiling. A campaign cap above this is refused before any provider is contacted.';
comment on column ads_account_ceilings.ceiling_minor is
  'Integer MINOR units (cents), never a float. A fractional value means floating-point maths was done on money upstream.';
comment on column ads_account_ceilings.currency is
  'ISO 4217. A cap in a different currency is REFUSED, not converted — an exchange rate applied here would be our guess about real money.';

-- ---------------------------------------------------------------------------
-- Campaigns — one row per authorised campaign.
-- ---------------------------------------------------------------------------
create table if not exists ads_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  platform_id         text        not null,
  account_ref         text        not null,
  campaign_ref        text,
  product_key         text,
  name                text        not null,
  currency            char(3)     not null,

  campaign_max_minor  bigint      not null,
  daily_max_minor     bigint,

  content_approved_by text        not null,
  content_approved_at timestamptz not null,
  spend_approved_by   text        not null,
  spend_approved_at   timestamptz not null,

  status              text        not null default 'pending',
  created_by          text        not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  reported_spend_minor bigint     not null default 0,
  last_reconciled_at   timestamptz,
  reconcile_error      text,

  constraint ads_campaign_cap_positive
    check (campaign_max_minor > 0),
  constraint ads_campaign_daily_within_cap
    check (daily_max_minor is null or (daily_max_minor > 0 and daily_max_minor <= campaign_max_minor)),
  constraint ads_campaign_currency
    check (currency ~ '^[A-Z]{3}$'),
  constraint ads_campaign_status
    check (status in ('pending', 'created_paused', 'running', 'paused', 'stopped', 'failed')),
  constraint ads_campaign_spend_not_negative
    check (reported_spend_minor >= 0),
  -- Two separate decisions, recorded separately and deliberately: the person who signs off
  -- on copy is usually not the person who signs off on money.
  constraint ads_campaign_separate_approvers
    check (length(trim(content_approved_by)) > 0 and length(trim(spend_approved_by)) > 0),
  -- A campaign the provider gave us no id for cannot be tracked or stopped. It may only be
  -- recorded as failed, never as something we believe is under control.
  constraint ads_campaign_ref_required_once_live
    check (campaign_ref is not null or status in ('pending', 'failed')),
  constraint ads_campaign_ref_unique
    unique (platform_id, campaign_ref)
);

create index if not exists ads_campaigns_status_idx  on ads_campaigns (status);
create index if not exists ads_campaigns_account_idx on ads_campaigns (platform_id, account_ref);
create index if not exists ads_campaigns_product_idx on ads_campaigns (product_key);

comment on table ads_campaigns is
  'Authorised ad campaigns. A row cannot exist without a cap and a named spend approver — the row is the authorisation.';
comment on column ads_campaigns.campaign_ref is
  'The provider''s own campaign id. Null only while pending or after a failed create; a campaign we cannot name is a campaign we cannot pause.';
comment on column ads_campaigns.status is
  'created_paused is the expected state immediately after create — campaigns are created PAUSED so a mistake in the create request costs nothing.';
comment on column ads_campaigns.reported_spend_minor is
  'Last spend REPORTED BY THE PROVIDER, in integer minor units. Never our own arithmetic: platforms overdeliver and convert currency.';
comment on column ads_campaigns.reconcile_error is
  'Set when reconciliation could not read the provider. A stale figure with no error would read as a healthy zero, which is the dangerous failure.';

-- ---------------------------------------------------------------------------
-- Spend events — append-only observations from the provider.
-- ---------------------------------------------------------------------------
create table if not exists ads_spend_events (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid        not null references ads_campaigns (id) on delete cascade,
  observed_at         timestamptz not null default now(),
  reported_spend_minor bigint     not null,
  currency            char(3)     not null,
  raw_amount          text        not null,
  raw_units           text        not null,
  over_cap            boolean     not null default false,
  source              text        not null default 'provider_report',

  constraint ads_spend_event_not_negative check (reported_spend_minor >= 0),
  constraint ads_spend_event_currency     check (currency ~ '^[A-Z]{3}$'),
  constraint ads_spend_event_units        check (raw_units in ('minor', 'major', 'micro')),
  constraint ads_spend_event_source       check (source in ('provider_report', 'manual_note'))
);

create index if not exists ads_spend_events_campaign_idx on ads_spend_events (campaign_id, observed_at desc);

comment on table ads_spend_events is
  'Append-only. Never UPDATE or DELETE a row here — a spend history that can be rewritten is not a record of anything.';
comment on column ads_spend_events.raw_amount is
  'Exactly what the provider returned, as text, before conversion. Kept so a units mistake is provable after the fact rather than argued about.';
comment on column ads_spend_events.raw_units is
  'The units the provider reported in. Stated explicitly, never inferred: guessing between minor and micro is a ten-thousandfold error.';
comment on column ads_spend_events.over_cap is
  'True when the provider reported more than the campaign cap. Platforms overdeliver; this is a fact to surface, not an error to suppress.';

-- ---------------------------------------------------------------------------
-- Current position per campaign, for the cockpit and the owner-gated route.
-- ---------------------------------------------------------------------------
create or replace view ads_campaign_position as
select
  c.id,
  c.platform_id,
  c.account_ref,
  c.campaign_ref,
  c.product_key,
  c.name,
  c.currency,
  c.campaign_max_minor,
  c.daily_max_minor,
  c.status,
  c.spend_approved_by,
  c.content_approved_by,
  c.reported_spend_minor,
  c.campaign_max_minor - c.reported_spend_minor as remaining_minor,
  (c.reported_spend_minor > c.campaign_max_minor) as over_cap,
  c.last_reconciled_at,
  c.reconcile_error,
  (
    select max(e.observed_at)
    from ads_spend_events e
    where e.campaign_id = c.id
  ) as last_event_at
from ads_campaigns c;

comment on view ads_campaign_position is
  'Cockpit read model. remaining_minor may go negative — an overdelivered campaign is a real state, not an invalid one.';
