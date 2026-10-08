-- A disposable DB proves replay rejection, tenant binding and closed defaults.
begin;
do $t$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 lot uuid:=gen_random_uuid(); rate uuid:=gen_random_uuid();
 denied boolean;
begin
 insert into lab.organizations(id,name) values(a,'stripe-proof-a'),(b,'stripe-proof-b');
 insert into lab.commercial_credit_rate_versions
  (rate_version_id,currency_code,denomination,software_service,credits_per_unit,effective_at,approval_ref)
 values(rate,'USD','unit-credit','governed-lab-work',100,now()-interval '1 day','test-only-approval');
 insert into lab.commercial_credit_lots
  (lot_id,organization_id,kind,granted_credits,source_system,source_reference)
 values(lot,a,'purchased',100,'operator_test_grant','stripe-evidence-test-lot01');
 if has_table_privilege('service_role','lab.commercial_stripe_settlement_evidence','INSERT')
  or has_table_privilege('authenticated','lab.commercial_stripe_settlement_evidence','SELECT')
 then raise exception 'Stripe evidence privilege exposed'; end if;
 denied:=false;
 begin
  insert into lab.commercial_stripe_settlement_evidence
   (organization_id,lot_id,rate_version_id,stripe_event_id,stripe_payment_intent_id,
    stripe_account_id,amount_received_minor,currency_code,payment_status,evidence_sha256,verified_at)
  values(b,lot,rate,'evt_test00112233','pi_test00112233','acct_test00112233',100,'USD','succeeded',repeat('a',64),now());
 exception when foreign_key_violation then denied:=true; end;
 if not denied then raise exception 'cross-tenant Stripe evidence allowed'; end if;
 insert into lab.commercial_stripe_settlement_evidence
   (organization_id,lot_id,rate_version_id,stripe_event_id,stripe_payment_intent_id,
    stripe_account_id,amount_received_minor,currency_code,payment_status,evidence_sha256,verified_at)
 values(a,lot,rate,'evt_test00112233','pi_test00112233','acct_test00112233',100,'USD','succeeded',repeat('a',64),now());
 denied:=false;
 begin
  insert into lab.commercial_stripe_settlement_evidence
   (organization_id,lot_id,rate_version_id,stripe_event_id,stripe_payment_intent_id,
    stripe_account_id,amount_received_minor,currency_code,payment_status,evidence_sha256,verified_at)
  values(a,lot,rate,'evt_test00445566','pi_test00112233','acct_test00112233',100,'USD','succeeded',repeat('b',64),now());
 exception when unique_violation then denied:=true; end;
 if not denied then raise exception 'duplicate payment intent accepted'; end if;
 denied:=false;
 begin
  insert into lab.commercial_stripe_settlement_evidence
   (organization_id,lot_id,rate_version_id,stripe_event_id,stripe_payment_intent_id,
    stripe_account_id,stripe_livemode,amount_received_minor,currency_code,payment_status,evidence_sha256,verified_at)
  values(a,lot,rate,'evt_test00778899','pi_test00778899','acct_test00112233',true,100,'USD','succeeded',repeat('c',64),now());
 exception when check_violation then denied:=true; end;
 if not denied then raise exception 'live-mode Stripe evidence accepted'; end if;
 denied:=false;
 begin
  update lab.commercial_stripe_settlement_evidence set amount_received_minor=200
   where stripe_event_id='evt_test00112233';
 exception when others then denied:=true; end;
 if not denied then raise exception 'Stripe evidence mutable'; end if;
 raise notice 'PASS closed Stripe evidence, tenant binding, duplicate rejection and live-mode denial';
end $t$;
rollback;
