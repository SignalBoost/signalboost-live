-- Detection-only acceptance: forged linkage must not look internally reconciled.
begin;
do $t$
declare a uuid:=gen_random_uuid(); lot uuid:=gen_random_uuid(); rate uuid:=gen_random_uuid();
begin
 insert into lab.organizations(id,name) values(a,'stripe-audit-probe');
 insert into lab.commercial_credit_rate_versions
 (rate_version_id,currency_code,denomination,software_service,credits_per_unit,effective_at,approval_ref)
 values(rate,'USD','unit-credit','governed-lab-work',10,now()-interval '1 day','audit-probe-approval');
 insert into lab.commercial_credit_lots
 (lot_id,organization_id,kind,granted_credits,source_system,source_reference)
 values(lot,a,'purchased',10,'operator_test_grant','unverified-operator-001');
 insert into lab.commercial_stripe_settlement_evidence
 (organization_id,lot_id,rate_version_id,stripe_event_id,stripe_payment_intent_id,
 stripe_account_id,amount_received_minor,currency_code,payment_status,evidence_sha256,verified_at)
 values(a,lot,rate,'evt_audit00010000','pi_audit00010000','acct_audit00010000',100,'USD','succeeded',repeat('a',64),now());
 if (select internally_consistent from lab.commercial_stripe_evidence_reconciliation
     where lot_id=lot)
 then raise exception 'operator test grant disguised as reconciled Stripe evidence'; end if;
 if (select stripe_origin_lot from lab.commercial_stripe_evidence_reconciliation
     where lot_id=lot)
 then raise exception 'non-Stripe lot source undetected'; end if;
 if has_table_privilege('authenticated','lab.commercial_stripe_evidence_reconciliation','SELECT')
    or has_table_privilege('service_role','lab.commercial_stripe_evidence_reconciliation','SELECT')
 then raise exception 'Stripe reconciliation view exposed'; end if;
 raise notice 'PASS forged Stripe source detected; reconciliation privileges closed';
end $t$;
rollback;
