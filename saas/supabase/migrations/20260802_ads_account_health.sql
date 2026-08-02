-- saas/supabase/migrations/20260802_ads_account_health.sql
--
-- WHAT MUST BE WATCHED, PER AD ACCOUNT — AT EVERY SIZE OF BUSINESS.
--
-- Reconciliation answers "what did this campaign spend". It cannot answer "why did spend
-- stop", and every common reason is silent: the network keeps answering our questions
-- correctly, it simply is not running the ads. A flat spend figure with nothing beside it
-- reads as a quiet campaign rather than a stopped one.
--
-- THREE BILLING MODES, ALL FIRST-CLASS. The platform is plug-and-play for any size of buyer,
-- so this table does not assume the enterprise arrangement:
--
--   invoiced  a credit line from the network, monthly invoice, net 30. What a large buyer
--             already has with press. Stops when the credit line fills or the invoice ages.
--   card      a payment method charged each time spend crosses a rolling threshold, or on
--             the monthly bill date. Stops when the card expires or a charge declines.
--   prepaid   funds added before delivery and drawn down as ads run. Stops at zero.
--
-- Each has its own silent ending, so each has its own columns here. A schema that only
-- modelled credit lines would leave every small buyer unwatched, and small buyers are the
-- ones least likely to notice a card expiring.
--
-- SOME OF THIS IS READ FROM THE NETWORK AND SOME IS ENTERED BY THE OWNER, and the row says
-- which. A notice that implies we read a due date from the platform when a person typed it
-- is worse than no notice: the operator stops checking.

create table if not exists ads_account_health (
  id                      uuid primary key default gen_random_uuid(),
  platform_id             text        not null,
  account_ref             text        not null,

  -- ── Credentials ───────────────────────────────────────────────────────────
  -- Populated by the OAuth path once tokens are stored rather than held in environment
  -- variables; null until then.
  token_expires_at        timestamptz,
  token_source            text        not null default 'env',

  -- ── Which of the three arrangements this account is on ────────────────────
  billing_mode            text        not null default 'unknown',
  currency                char(3),

  -- invoiced: the credit line and the invoice
  credit_limit_minor      bigint,
  credit_used_minor       bigint,
  invoice_due_at          date,

  -- card: the payment method and the rolling threshold
  -- A card expiring is the single most common silent stop for a small advertiser, and the
  -- one nobody thinks to check until delivery has already halted.
  card_last4              text,
  card_expires_on         date,
  billing_threshold_minor bigint,
  last_charge_failed_at   timestamptz,
  last_charge_error       text,

  -- prepaid: what is left to spend
  balance_minor           bigint,

  -- What the network says about the account as a whole, distinct from any one campaign.
  payment_state           text        not null default 'unknown',

  -- ── Provenance, per the note above ────────────────────────────────────────
  billing_source          text        not null default 'declared',
  last_checked_at         timestamptz,
  check_error             text,
  note                    text,
  updated_at              timestamptz not null default now(),
  updated_by              text,

  constraint ads_health_unique       unique (platform_id, account_ref),
  constraint ads_health_currency     check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint ads_health_token_source check (token_source in ('env', 'oauth')),
  constraint ads_health_billing_mode check (billing_mode in ('unknown', 'card', 'prepaid', 'invoiced')),
  constraint ads_health_billing_src  check (billing_source in ('network', 'declared')),
  constraint ads_health_payment      check (payment_state in ('unknown', 'ok', 'limit_reached', 'past_due', 'declined', 'suspended')),
  -- Money columns are integer minor units, never floats, and never negative except a
  -- balance, which a network may legitimately report as overdrawn.
  constraint ads_health_credit_pair  check (
    (credit_limit_minor is null and credit_used_minor is null)
    or (credit_limit_minor > 0 and credit_used_minor >= 0 and currency is not null)
  ),
  constraint ads_health_balance      check (balance_minor is null or currency is not null),
  constraint ads_health_threshold    check (billing_threshold_minor is null or billing_threshold_minor > 0),
  -- Only the last four digits, ever. There is no reason for this system to hold more of a
  -- payment instrument than is needed to say which card is expiring.
  constraint ads_health_card_last4   check (card_last4 is null or card_last4 ~ '^[0-9]{4}$')
);

create index if not exists ads_account_health_due_idx     on ads_account_health (invoice_due_at);
create index if not exists ads_account_health_token_idx   on ads_account_health (token_expires_at);
create index if not exists ads_account_health_card_idx    on ads_account_health (card_expires_on);

comment on table ads_account_health is
  'One row per ad account, for every billing arrangement. Holds the things that stop delivery silently: token expiry, credit-line headroom, invoice date, card expiry, declined charges, prepaid balance.';
comment on column ads_account_health.billing_mode is
  'invoiced = credit line and monthly invoice (the enterprise arrangement). card = charged at a rolling threshold. prepaid = funds drawn down. Each fails differently and is watched differently.';
comment on column ads_account_health.billing_source is
  'network = read from the platform. declared = a person entered it. A notice must never imply the first when it is the second.';
comment on column ads_account_health.credit_limit_minor is
  'The platform''s credit line, in integer minor units. Reaching it pauses delivery until the invoice is paid or the limit raised.';
comment on column ads_account_health.card_expires_on is
  'Stored because an expiring card halts delivery with no warning from our side, and re-issuing one takes days. Only the expiry and the last four digits are kept.';
comment on column ads_account_health.balance_minor is
  'Prepaid funds remaining. Delivery stops at zero regardless of what any campaign cap allows.';
comment on column ads_account_health.payment_state is
  'Account-level state from the network. limit_reached, past_due, declined and suspended all stop ads while every campaign still reads as healthy.';
comment on column ads_account_health.check_error is
  'Set when the health read failed. Stored because a stale row with no error looks like a healthy one.';
