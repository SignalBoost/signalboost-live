-- Enforce the already-declared per-experiment spending cap at the serialized reservation boundary.
-- Never retroactively change historical credit events.
create or replace function lab.apply_credit_event(
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
    -- Budget is scoped to the experiment, not just the organization account.
    -- The account row lock above serializes reservations across all experiments.
    if (
      select coalesce(sum(reserve_microcredits - refunded_microcredits),0)
      from lab.reservations where organization_id=p_organization_id and experiment_id=p_experiment_id
    ) + p_amount > (
      select budget_microcredits from lab.experiments
      where id=p_experiment_id and organization_id=p_organization_id
    ) then
      raise exception 'lab_experiment_budget_exceeded';
    end if;
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
