-- Phase 4: preserve the precise provenance of a rated capture.
-- No live provider integrations or invoicing are enabled by this migration.
create table lab.rated_capture_receipts (
  event_id bigint primary key references lab.credit_events(event_id),
  organization_id uuid not null references lab.organizations(id),
  rate_id uuid not null references lab.approved_usage_rates(rate_id),
  provider text not null,
  model text not null,
  usage_unit text not null,
  usage_units bigint not null check (usage_units > 0),
  used_at timestamptz not null,
  source_receipt_ref text not null check (length(btrim(source_receipt_ref)) > 0),
  quoted_microcredits bigint not null check (quoted_microcredits > 0),
  created_at timestamptz not null default now(),
  unique(organization_id,source_receipt_ref,rate_id,usage_unit)
);
alter table lab.rated_capture_receipts enable row level security;
revoke all on lab.rated_capture_receipts from public,anon,authenticated,service_role;
create trigger lab_rated_capture_no_update_delete before update or delete
on lab.rated_capture_receipts for each row execute function lab.prevent_usage_rate_mutation();

create function lab.capture_rated_usage(
 p_org uuid,p_experiment uuid,p_reservation uuid,p_key text,
 p_rate uuid,p_provider text,p_model text,p_unit text,p_units bigint,p_used_at timestamptz,
 p_cost_usd numeric,p_receipt_ref text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,lab as $$
declare amount bigint; outcome jsonb; captured_event_id bigint; prior lab.rated_capture_receipts%rowtype;
begin
 if session_user not in ('postgres','service_role') or
  current_setting('lab.trusted_organization_id',true) is distinct from p_org::text
 then raise exception 'lab_tenant_authority_denied'; end if;
 if p_cost_usd is null or p_cost_usd < 0 or nullif(btrim(p_receipt_ref),'') is null
 then raise exception 'lab_measured_receipt_required'; end if;
 amount:=lab.quote_usage_microcredits(p_org,p_rate,p_provider,p_model,p_unit,p_units,p_used_at);
 -- Lock the account as the legacy ledger does; prevent race between duplicate receipts with different keys.
 perform 1 from lab.credit_accounts where organization_id=p_org for update;
 select * into prior from lab.rated_capture_receipts
  where organization_id=p_org and source_receipt_ref=p_receipt_ref
    and rate_id=p_rate and usage_unit=p_unit;
 if found and (prior.quoted_microcredits<>amount or prior.usage_units<>p_units
   or prior.provider<>p_provider or prior.model<>p_model or prior.used_at<>p_used_at)
 then raise exception 'lab_receipt_conflict'; end if;
 if found then
   -- A different idempotency key cannot double-charge the same underlying receipt.
   if not exists(select 1 from lab.credit_events where event_id=prior.event_id and idempotency_key=p_key
     and reservation_id=p_reservation and measured_cost_usd=p_cost_usd)
   then raise exception 'lab_receipt_conflict'; end if;
 end if;
 outcome:=lab.apply_credit_event(p_org,p_experiment,p_reservation,'capture',amount,p_key,p_cost_usd,p_receipt_ref);
 captured_event_id:=(outcome->>'event_id')::bigint;
 if exists(select 1 from lab.rated_capture_receipts where event_id=captured_event_id) then
   if not exists(select 1 from lab.rated_capture_receipts x where x.event_id=captured_event_id
     and x.organization_id=p_org and x.rate_id=p_rate and x.provider=p_provider
     and x.model=p_model and x.usage_unit=p_unit and x.usage_units=p_units
     and x.used_at=p_used_at and x.source_receipt_ref=p_receipt_ref
     and x.quoted_microcredits=amount)
   then raise exception 'lab_receipt_conflict'; end if;
 else
  insert into lab.rated_capture_receipts(event_id,organization_id,rate_id,provider,model,
    usage_unit,usage_units,used_at,source_receipt_ref,quoted_microcredits)
  values(captured_event_id,p_org,p_rate,p_provider,p_model,p_unit,p_units,p_used_at,p_receipt_ref,amount);
 end if;
 return outcome;
end $$;
revoke all on function lab.capture_rated_usage(uuid,uuid,uuid,text,uuid,text,text,text,bigint,timestamptz,numeric,text)
 from public,anon,authenticated;
grant execute on function lab.capture_rated_usage(uuid,uuid,uuid,text,uuid,text,text,text,bigint,timestamptz,numeric,text) to service_role;
