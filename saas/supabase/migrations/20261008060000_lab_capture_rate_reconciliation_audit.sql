-- Phase 4: audit rated captures against the immutable approved rate, not merely receipt count.
-- This does not certify that external provider receipts or invoices are authentic.
create or replace function lab.audit_capture_provenance(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,lab as $$
declare total_captures bigint; rated_captures bigint; mismatched bigint; accounting jsonb;
begin
 if session_user not in ('postgres','service_role')
 or current_setting('lab.trusted_organization_id',true) is distinct from p_organization_id::text
 then raise exception 'lab_tenant_authority_denied'; end if;
 accounting:=lab.reconcile_credit_account(p_organization_id);
 select count(*) into total_captures from lab.credit_events
 where organization_id=p_organization_id and operation='capture';
 select count(*) into rated_captures from lab.credit_events e
 join lab.rated_capture_receipts r on r.event_id=e.event_id
 where e.organization_id=p_organization_id and e.operation='capture';
 select count(*) into mismatched from lab.credit_events e
 join lab.rated_capture_receipts r on r.event_id=e.event_id
 left join lab.approved_usage_rates rate on rate.rate_id=r.rate_id
 where e.organization_id=p_organization_id and (
   e.operation<>'capture'
   or r.organization_id<>e.organization_id
   or rate.rate_id is null
   or rate.organization_id<>e.organization_id
   or rate.provider<>r.provider or rate.model<>r.model or rate.unit<>r.usage_unit
   or rate.effective_at>r.used_at
   or (rate.expires_at is not null and r.used_at>=rate.expires_at)
   or r.usage_units > 9223372036854775807 / greatest(coalesce(rate.microcredits_per_unit,1),1)
   or r.quoted_microcredits<>r.usage_units*coalesce(rate.microcredits_per_unit,0)
   or r.quoted_microcredits<>e.amount_microcredits
   or r.source_receipt_ref is distinct from e.measured_cost_ref
   or e.measured_cost_usd is null or e.measured_cost_usd<0
   or exists (
     select 1 from lab.approved_usage_rates overlapping_rate
     where overlapping_rate.rate_id<>r.rate_id
       and overlapping_rate.organization_id=r.organization_id
       and overlapping_rate.provider=r.provider and overlapping_rate.model=r.model
       and overlapping_rate.unit=r.usage_unit
       and overlapping_rate.effective_at<=r.used_at
       and (overlapping_rate.expires_at is null or r.used_at<overlapping_rate.expires_at)
   )
 );
 return jsonb_build_object('pass',coalesce((accounting->>'pass')::boolean,false)
 and total_captures=rated_captures and mismatched=0,
 'accounting_pass',coalesce((accounting->>'pass')::boolean,false),
 'capture_events',total_captures,'rated_capture_events',rated_captures,
 'unrated_capture_events',total_captures-rated_captures,'mismatched_rated_events',mismatched,
 'provider_receipts_independently_verified',false,'invoice_reconciliation_verified',false);
end $$;
revoke all on function lab.audit_capture_provenance(uuid) from public,anon,authenticated;
grant execute on function lab.audit_capture_provenance(uuid) to service_role;
