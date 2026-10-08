-- Commercial Phase 4 schema foundation only.
-- Deliberately NO customer-accessible grants, no mutation RPC, no payment webhook writes.
-- This is not an active purchased-credit wallet or a certification claim.
create table lab.commercial_credit_rate_versions (
 rate_version_id uuid primary key default gen_random_uuid(),
 currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
 denomination text not null check (length(btrim(denomination)) between 3 and 64),
 software_service text not null check (length(btrim(software_service)) between 3 and 128),
 credits_per_unit bigint not null check (credits_per_unit > 0),
 effective_at timestamptz not null,
 retired_at timestamptz,
 approval_ref text not null check (length(btrim(approval_ref)) >= 8),
 created_at timestamptz not null default now(),
 check (retired_at is null or retired_at > effective_at)
);
create table lab.commercial_credit_lots (
 lot_id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references lab.organizations(id),
 kind text not null check (kind in ('purchased','subscription','promotional')),
 granted_credits bigint not null check (granted_credits > 0),
 source_system text not null check (source_system in ('stripe','operator_test_grant')),
 source_reference text not null check (length(btrim(source_reference)) between 8 and 200),
 expiry_at timestamptz,
 created_at timestamptz not null default now(),
 unique (organization_id,source_system,source_reference),
 unique (lot_id,organization_id),
 check (kind <> 'purchased' or expiry_at is null)
);
create table lab.commercial_credit_journal (
 journal_id bigint generated always as identity primary key,
 organization_id uuid not null references lab.organizations(id),
 lot_id uuid not null,
 operation text not null check (operation in ('grant','reserve','capture','release','refund','chargeback')),
 amount_credits bigint not null check (amount_credits > 0),
 event_key text not null check (length(btrim(event_key)) between 16 and 200),
 source_reference text not null check (length(btrim(source_reference)) between 8 and 200),
 experiment_id uuid,
 created_at timestamptz not null default now(),
 unique (organization_id,event_key),
 foreign key (lot_id,organization_id) references lab.commercial_credit_lots(lot_id,organization_id),
 foreign key (experiment_id,organization_id) references lab.experiments(id,organization_id)
);
create function lab.prevent_commercial_wallet_mutation() returns trigger
language plpgsql set search_path=pg_catalog,lab as $$
begin raise exception 'commercial_wallet_append_only'; end $$;
create trigger commercial_rate_immutable before update or delete on lab.commercial_credit_rate_versions
 for each row execute function lab.prevent_commercial_wallet_mutation();
create trigger commercial_lot_immutable before update or delete on lab.commercial_credit_lots
 for each row execute function lab.prevent_commercial_wallet_mutation();
create trigger commercial_journal_immutable before update or delete on lab.commercial_credit_journal
 for each row execute function lab.prevent_commercial_wallet_mutation();
alter table lab.commercial_credit_rate_versions enable row level security;
alter table lab.commercial_credit_lots enable row level security;
alter table lab.commercial_credit_journal enable row level security;
revoke all on lab.commercial_credit_rate_versions,lab.commercial_credit_lots,lab.commercial_credit_journal from public,anon,authenticated,service_role;
revoke all on sequence lab.commercial_credit_journal_journal_id_seq from public,anon,authenticated,service_role;
revoke all on function lab.prevent_commercial_wallet_mutation() from public,anon,authenticated,service_role;
-- Never add a Stripe integration here without atomic grants, a journal reconciliation
-- contract, an immutable rate revision and explicitly approved financial controls.
