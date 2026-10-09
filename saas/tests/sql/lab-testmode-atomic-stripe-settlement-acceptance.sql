begin;
do $t$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); rate uuid:=gen_random_uuid();
 v jsonb; lot uuid; rejected boolean;
begin
 insert into lab.organizations(id,name) values(a,'atomic-stripe-test-a'),(b,'atomic-stripe-test-b');
 insert into lab.commercial_credit_rate_versions
 (rate_version_id,currency_code,denomination,software_service,credits_per_unit,effective_at,approval_ref)
 values(rate,'USD','test-denom','governed-lab-work',10,now()-interval '1 day','test-approval-100');
 perform set_config('lab.trusted_organization_id',a::text,true);
 rejected:=false;
 begin
  perform lab.testmode_atomic_stripe_settlement(a,'evt_atomic0000001','pi_atomic0000001',
   'acct_atomic0000001',rate,100,'USD',repeat('a',64),10);
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'unverified Stripe proof allowed'; end if;
 perform set_config('lab.stripe_test_verification','approved_test_only',true);
 v:=lab.testmode_atomic_stripe_settlement(a,'evt_atomic0000001','pi_atomic0000001',
 'acct_atomic0000001',rate,100,'USD',repeat('a',64),10);
 lot:=(v->>'lot_id')::uuid;
 if (v->>'replayed')::boolean then raise exception 'first settlement replayed'; end if;
 v:=lab.testmode_atomic_stripe_settlement(a,'evt_atomic0000001','pi_atomic0000001',
 'acct_atomic0000001',rate,100,'USD',repeat('a',64),10);
 if not (v->>'replayed')::boolean or (v->>'lot_id')::uuid<>lot then
 raise exception 'same event changed wallet lot'; end if;
 rejected:=false;
 begin
  perform lab.testmode_atomic_stripe_settlement(a,'evt_atomic0000002','pi_atomic0000001',
   'acct_atomic0000001',rate,100,'USD',repeat('a',64),10);
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'duplicate payment intent with changed event allowed'; end if;
 rejected:=false;
 begin
  perform set_config('lab.trusted_organization_id',b::text,true);
  perform lab.testmode_atomic_stripe_settlement(b,'evt_atomic0000001','pi_atomic0000001',
   'acct_atomic0000001',rate,100,'USD',repeat('a',64),10);
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'cross-tenant Stripe event replay allowed'; end if;
 if (select count(*) from lab.commercial_credit_lots where lot_id=lot)<>1
 or (select count(*) from lab.commercial_credit_journal where lot_id=lot and operation='grant')<>1
 or (select count(*) from lab.commercial_credit_event_claims where lot_id=lot)<>1
 or (select count(*) from lab.commercial_stripe_settlement_evidence where lot_id=lot)<>1
 then raise exception 'settlement evidence not atomic'; end if;
 if not (select internally_consistent from lab.commercial_stripe_evidence_reconciliation
 where lot_id=lot) then raise exception 'atomic settlement does not reconcile'; end if;
 if has_function_privilege('service_role',
 'lab.testmode_atomic_stripe_settlement(uuid,text,text,text,uuid,bigint,text,text,bigint)','EXECUTE')
 then raise exception 'service role can mint proof credits'; end if;
 raise notice 'PASS atomic settlement/replay/cross-tenant/closed privilege proof';
end $t$;
rollback;
