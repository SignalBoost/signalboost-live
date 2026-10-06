-- iTMounts Lab: durable tenant hierarchy and append-only credit reservation accounting.
-- No default tenant, no public execution permissions, no invented price or credit balance.
create schema if not exists lab;
revoke all on schema lab from public, anon, authenticated;
grant usage on schema lab to service_role;

create table lab.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);
create table lab.universities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references lab.organizations(id),
  name text not null check (length(btrim(name)) > 0),
  unique(id, organization_id)
);
create table lab.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  university_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  foreign key (university_id, organization_id) references lab.universities(id, organization_id),
  unique(id, organization_id)
);
create table lab.experiments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  privacy_tier text not null check (privacy_tier in ('PRIVATE','AGGREGATE_METRICS','RESEARCH_OPT_IN')),
  budget_microcredits bigint not null check (budget_microcredits >= 0),
  foreign key (project_id, organization_id) references lab.projects(id, organization_id),
  unique(id, organization_id)
);
create table lab.cohorts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  experiment_id uuid not null,
  foreign key (experiment_id, organization_id) references lab.experiments(id, organization_id),
  unique(id, organization_id)
);
create table lab.artifacts (
  permanent_artifact_id uuid primary key,
  organization_id uuid not null,
  cohort_id uuid not null,
  fingerprint_sha256 text not null check (fingerprint_sha256 ~ '^[a-f0-9]{64}$'),
  foreign key (cohort_id, organization_id) references lab.cohorts(id, organization_id),
  unique(permanent_artifact_id, organization_id)
);
create table lab.credit_accounts (
  organization_id uuid primary key references lab.organizations(id),
  funded_microcredits bigint not null default 0 check (funded_microcredits >= 0),
  reserved_microcredits bigint not null default 0 check (reserved_microcredits >= 0),
  captured_microcredits bigint not null default 0 check (captured_microcredits >= 0),
  refunded_microcredits bigint not null default 0 check (refunded_microcredits >= 0),
  check (reserved_microcredits + captured_microcredits - refunded_microcredits <= funded_microcredits),
  check (refunded_microcredits <= captured_microcredits)
);
create table lab.reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references lab.credit_accounts(organization_id),
  experiment_id uuid not null,
  reserve_microcredits bigint not null check (reserve_microcredits > 0),
  captured_microcredits bigint not null default 0 check (captured_microcredits >= 0),
  released_microcredits bigint not null default 0 check (released_microcredits >= 0),
  refunded_microcredits bigint not null default 0 check (refunded_microcredits >= 0),
  idempotency_key text not null check (length(idempotency_key) between 16 and 200),
  created_at timestamptz not null default now(),
  foreign key (experiment_id, organization_id) references lab.experiments(id, organization_id),
  unique(organization_id, idempotency_key),
  unique(id, organization_id),
  check (captured_microcredits + released_microcredits <= reserve_microcredits),
  check (refunded_microcredits <= captured_microcredits)
);
create table lab.credit_events (
  event_id bigint generated always as identity primary key,
  organization_id uuid not null,
  reservation_id uuid not null,
  operation text not null check (operation in ('reserve','capture','release','refund')),
  amount_microcredits bigint not null check (amount_microcredits > 0),
  idempotency_key text not null check (length(idempotency_key) between 16 and 200),
  measured_cost_usd numeric(20,9),
  measured_cost_ref text,
  failure_class text,
  created_at timestamptz not null default now(),
  foreign key (reservation_id, organization_id) references lab.reservations(id, organization_id),
  unique(organization_id, idempotency_key),
  check ((operation = 'capture' and measured_cost_usd is not null and measured_cost_usd >= 0 and measured_cost_ref is not null and length(btrim(measured_cost_ref)) > 0)
      or (operation <> 'capture' and measured_cost_usd is null and measured_cost_ref is null)),
  check (operation <> 'refund' or failure_class = 'PLATFORM_FAILURE')
);
-- Withhold table writes: atomic mutation only through the security-definer function.
do $$ declare t text; begin
  foreach t in array array['organizations','universities','projects','experiments','cohorts','artifacts','credit_accounts','reservations','credit_events']
  loop
    execute format('alter table lab.%I enable row level security',t);
    execute format('revoke all on lab.%I from public, anon, authenticated',t);
  end loop;
end $$;
revoke all on all tables in schema lab from service_role;
revoke all on all sequences in schema lab from public, anon, authenticated;
-- This schema is private to server-side operators. The tenant binding must originate
-- from a verified Harness authority envelope, never caller-controlled input.
-- Tenant authorization is checked against the transaction-scoped, trusted database assertion.
-- Never derive this value from request JSON, a query string or a client-controlled JWT claim.
create function lab.apply_credit_event(
  p_organization_id uuid, p_experiment_id uuid, p_reservation_id uuid,
  p_operation text, p_amount bigint, p_idempotency_key text,
  p_measured_cost_usd numeric default null, p_measured_cost_ref text default null,
  p_failure_class text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, lab as $$
declare
  a lab.credit_accounts%rowtype;
  r lab.reservations%rowtype;
  previous lab.credit_events%rowtype;
  event_id_out bigint;
begin
  if session_user not in ('postgres','service_role') or
     current_setting('lab.trusted_organization_id',true) is distinct from p_organization_id::text then
    raise exception 'lab_tenant_authority_denied';
  end if;
  if p_amount is null or p_amount <= 0 or coalesce(length(p_idempotency_key),0) not between 16 and 200 or
    p_operation is null or p_operation not in ('reserve','capture','release','refund') then
    raise exception 'lab_invalid_credit_operation';
  end if;
  -- Lock the account BEFORE checking the idempotency key to serialize concurrent retries.
  select * into a from lab.credit_accounts where organization_id = p_organization_id for update;
  if not found then raise exception 'lab_credit_account_missing'; end if;
  select * into previous from lab.credit_events
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
  if found then
    if previous.operation <> p_operation or previous.amount_microcredits <> p_amount
      or previous.reservation_id is distinct from p_reservation_id
      or previous.measured_cost_usd is distinct from p_measured_cost_usd
      or previous.measured_cost_ref is distinct from p_measured_cost_ref
      or previous.failure_class is distinct from p_failure_class then
      raise exception 'lab_idempotency_conflict';
    end if;
    return jsonb_build_object('event_id',previous.event_id,'reservation_id',previous.reservation_id,'replayed',true);
  end if;
  if p_operation = 'reserve' then
    if p_reservation_id is null or p_experiment_id is null or p_measured_cost_usd is not null
       or p_measured_cost_ref is not null or p_failure_class is not null then
      raise exception 'lab_invalid_reserve';
    end if;
    perform 1 from lab.experiments where id=p_experiment_id and organization_id=p_organization_id;
    if not found then raise exception 'lab_experiment_tenant_mismatch'; end if;
    if a.funded_microcredits - a.reserved_microcredits - a.captured_microcredits + a.refunded_microcredits < p_amount then
      raise exception 'lab_insufficient_credits';
    end if;
    insert into lab.reservations(id, organization_id, experiment_id, reserve_microcredits, idempotency_key)
      values(p_reservation_id,p_organization_id,p_experiment_id,p_amount,p_idempotency_key);
    update lab.credit_accounts set reserved_microcredits=reserved_microcredits+p_amount where organization_id=p_organization_id;
  else
    select * into r from lab.reservations where id=p_reservation_id and organization_id=p_organization_id for update;
    if not found then raise exception 'lab_reservation_tenant_mismatch'; end if;
    if p_experiment_id is distinct from r.experiment_id then raise exception 'lab_experiment_tenant_mismatch'; end if;
    if p_operation='capture' then
      if p_measured_cost_usd is null or p_measured_cost_usd < 0
        or nullif(btrim(p_measured_cost_ref),'') is null or p_failure_class is not null then
        raise exception 'lab_capture_requires_measured_cost';
      end if;
      if r.reserve_microcredits-r.captured_microcredits-r.released_microcredits < p_amount then
        raise exception 'lab_reservation_exceeded';
      end if;
      update lab.reservations set captured_microcredits=captured_microcredits+p_amount where id=r.id;
      update lab.credit_accounts set reserved_microcredits=reserved_microcredits-p_amount,captured_microcredits=captured_microcredits+p_amount where organization_id=p_organization_id;
    elsif p_operation='release' then
      if p_measured_cost_usd is not null or p_measured_cost_ref is not null or p_failure_class is not null then raise exception 'lab_invalid_release'; end if;
      if r.reserve_microcredits-r.captured_microcredits-r.released_microcredits < p_amount then raise exception 'lab_reservation_exceeded'; end if;
      update lab.reservations set released_microcredits=released_microcredits+p_amount where id=r.id;
      update lab.credit_accounts set reserved_microcredits=reserved_microcredits-p_amount where organization_id=p_organization_id;
    elsif p_operation='refund' then
      if p_failure_class <> 'PLATFORM_FAILURE' or p_measured_cost_usd is not null or p_measured_cost_ref is not null then raise exception 'lab_refund_not_authorized'; end if;
      if r.captured_microcredits-r.refunded_microcredits < p_amount then raise exception 'lab_refund_exceeded'; end if;
      update lab.reservations set refunded_microcredits=refunded_microcredits+p_amount where id=r.id;
      update lab.credit_accounts set refunded_microcredits=refunded_microcredits+p_amount where organization_id=p_organization_id;
    end if;
  end if;
  insert into lab.credit_events(organization_id,reservation_id,operation,amount_microcredits,idempotency_key,measured_cost_usd,measured_cost_ref,failure_class)
    values(p_organization_id,p_reservation_id,p_operation,p_amount,p_idempotency_key,p_measured_cost_usd,p_measured_cost_ref,p_failure_class)
    returning event_id into event_id_out;
  return jsonb_build_object('event_id',event_id_out,'reservation_id',p_reservation_id,'replayed',false);
end $$;
revoke all on function lab.apply_credit_event(uuid,uuid,uuid,text,bigint,text,numeric,text,text) from public, anon, authenticated;
grant execute on function lab.apply_credit_event(uuid,uuid,uuid,text,bigint,text,numeric,text,text) to service_role;
-- Operational reconciliation is computed from authoritative rows, not mutable billing estimates.
create function lab.reconcile_credit_account(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare a lab.credit_accounts%rowtype; agg record; mismatch boolean;
begin
  if session_user not in ('postgres','service_role') or
     current_setting('lab.trusted_organization_id',true) is distinct from p_organization_id::text then
    raise exception 'lab_tenant_authority_denied';
  end if;
  select * into a from lab.credit_accounts where organization_id=p_organization_id;
  if not found then raise exception 'lab_credit_account_missing'; end if;
  select coalesce(sum(reserve_microcredits-captured_microcredits-released_microcredits),0)::bigint reserved,
         coalesce(sum(captured_microcredits),0)::bigint captured,
         coalesce(sum(refunded_microcredits),0)::bigint refunded
    into agg from lab.reservations where organization_id=p_organization_id;
  select (a.reserved_microcredits<>agg.reserved or a.captured_microcredits<>agg.captured
          or a.refunded_microcredits<>agg.refunded) into mismatch;
  return jsonb_build_object('pass',not mismatch,'stored_reserved',a.reserved_microcredits,
    'computed_reserved',agg.reserved,'stored_captured',a.captured_microcredits,
    'computed_captured',agg.captured,'stored_refunded',a.refunded_microcredits,
    'computed_refunded',agg.refunded);
end $$;
revoke all on function lab.reconcile_credit_account(uuid) from public, anon, authenticated;
grant execute on function lab.reconcile_credit_account(uuid) to service_role;

-- SECURITY: service_role credentials and lab.trusted_organization_id are trusted only
-- inside a server-side, verified Harness authority envelope. The GUC is not a
-- substitute for authentication. Never expose this RPC or transaction setting
-- to unverified callers. No service_role execute privilege is granted to
-- tenant/client roles.
create function lab.prevent_credit_event_mutation() returns trigger language plpgsql
set search_path = pg_catalog, lab as $$
begin raise exception 'lab_credit_events_append_only'; end $$;
create trigger lab_credit_event_no_update_delete before update or delete on lab.credit_events
for each row execute function lab.prevent_credit_event_mutation();
