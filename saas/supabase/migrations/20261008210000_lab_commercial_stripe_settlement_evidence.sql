-- Closed-default proof schema for verified Stripe payment evidence.
-- No webhook writer, grant RPC, checkout endpoint, or live charging is enabled.
-- The eventual trusted consumer must verify Stripe signatures and fetch the
-- authoritative payment before inserting evidence and granting credits atomically.
create table lab.commercial_stripe_settlement_evidence (
 evidence_id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references lab.organizations(id),
 lot_id uuid not null,
 rate_version_id uuid not null references lab.commercial_credit_rate_versions(rate_version_id),
 stripe_event_id text not null unique check (stripe_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'),
 stripe_payment_intent_id text not null unique check (stripe_payment_intent_id ~ '^pi_[A-Za-z0-9_]{8,}$'),
 stripe_account_id text not null check (stripe_account_id ~ '^acct_[A-Za-z0-9_]{8,}$'),
 stripe_livemode boolean not null default false check (stripe_livemode = false),
 amount_received_minor bigint not null check (amount_received_minor > 0),
 currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
 payment_status text not null check (payment_status = 'succeeded'),
 evidence_sha256 text not null check (evidence_sha256 ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz not null,
 created_at timestamptz not null default now(),
 foreign key(lot_id,organization_id)
  references lab.commercial_credit_lots(lot_id,organization_id)
);
create trigger commercial_stripe_evidence_immutable
 before update or delete on lab.commercial_stripe_settlement_evidence
 for each row execute function lab.prevent_commercial_wallet_mutation();
alter table lab.commercial_stripe_settlement_evidence enable row level security;
revoke all on lab.commercial_stripe_settlement_evidence from public,anon,authenticated,service_role;
-- Future production migrations require independently approved live-mode authority.
