-- Run against a disposable PostgreSQL database AFTER applying the Lab migration.
-- All fixtures and mutations are rolled back. A raised exception means FAIL.
BEGIN;
DO $test$
DECLARE
 o uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
 e uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid();
 result jsonb; reconciliation jsonb; rejected boolean;
BEGIN
 INSERT INTO lab.organizations(id,name) VALUES(o,'lab-ledger-acceptance'),(other_org,'other-tenant');
 INSERT INTO lab.universities(id,organization_id,name) VALUES(u,o,'acceptance');
 INSERT INTO lab.projects(id,organization_id,university_id,name) VALUES(p,o,u,'acceptance');
 INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 VALUES(e,o,p,'PRIVATE',1000);
 INSERT INTO lab.credit_accounts(organization_id,funded_microcredits) VALUES(o,1000),(other_org,1000);
 PERFORM set_config('lab.trusted_organization_id',o::text,true);
 result:=lab.apply_credit_event(o,e,r,'reserve',600,'reserve-accept-00001');
 IF (result->>'replayed')::boolean THEN RAISE EXCEPTION 'initial reserve incorrectly replayed'; END IF;
 result:=lab.apply_credit_event(o,e,r,'reserve',600,'reserve-accept-00001');
 IF NOT (result->>'replayed')::boolean THEN RAISE EXCEPTION 'idempotency retry was not replayed'; END IF;
 PERFORM lab.apply_credit_event(o,e,r,'capture',250,'capture-accept-00001',0.25,'receipt-accept-00001');
 PERFORM lab.apply_credit_event(o,e,r,'release',350,'release-accept-00001');
 reconciliation:=lab.reconcile_credit_account(o);
 IF NOT (reconciliation->>'pass')::boolean THEN RAISE EXCEPTION 'ledger reconciliation failed: %',reconciliation; END IF;
 IF (reconciliation->>'event_reserved')::bigint<>600 OR
    (reconciliation->>'event_captured')::bigint<>250 OR
    (reconciliation->>'event_released')::bigint<>350 OR
    (reconciliation->>'event_refunded')::bigint<>0
 THEN RAISE EXCEPTION 'credit event reconciliation mismatch: %',reconciliation; END IF;
 IF (SELECT reserved_microcredits FROM lab.credit_accounts WHERE organization_id=o)<>0
 OR (SELECT captured_microcredits FROM lab.credit_accounts WHERE organization_id=o)<>250
 THEN RAISE EXCEPTION 'incorrect account balances'; END IF;
 rejected:=false;
 BEGIN
  PERFORM lab.apply_credit_event(other_org,e,r,'capture',1,'tenant-deny-000001',0.01,'other-receipt');
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'cross-tenant mutation accepted'; END IF;
 rejected:=false;
 BEGIN
  PERFORM lab.apply_credit_event(o,e,r,'reserve',601,'reserve-accept-00001');
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'idempotency conflict accepted'; END IF;
 rejected:=false;
 BEGIN
  PERFORM lab.apply_credit_event(o,e,gen_random_uuid(),'reserve',800,'overspend-deny-00001');
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'overspending accepted'; END IF;
 
 -- Verify platform-fault refund is accounted for and reconciles to events.
 PERFORM lab.apply_credit_event(o,e,r,'refund',100,'refund-accept-00001',null,null,'PLATFORM_FAILURE');
 reconciliation:=lab.reconcile_credit_account(o);
 IF NOT (reconciliation->>'pass')::boolean OR (reconciliation->>'event_refunded')::bigint<>100
 THEN RAISE EXCEPTION 'refund reconciliation failed: %',reconciliation; END IF;
 IF (SELECT refunded_microcredits FROM lab.credit_accounts WHERE organization_id=o)<>100
 THEN RAISE EXCEPTION 'incorrect refunded balance'; END IF;
 rejected:=false;
 BEGIN
  PERFORM lab.apply_credit_event(o,e,r,'refund',151,'refund-over-00001',null,null,'PLATFORM_FAILURE');
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'excess refund accepted'; END IF;
 rejected:=false;
 BEGIN
  PERFORM lab.apply_credit_event(o,e,r,'refund',1,'refund-unauth-0001',null,null,'CUSTOMER_ERROR');
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'unauthorized refund accepted'; END IF;
 -- A second experiment cannot borrow the first experiment's budget.
 rejected:=false;
 BEGIN
  INSERT INTO lab.projects(id,organization_id,university_id,name)
    VALUES(gen_random_uuid(),other_org,u,'cross-tenant-project');
 EXCEPTION WHEN foreign_key_violation THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'cross-tenant project hierarchy accepted'; END IF;
 rejected:=false;
 BEGIN
  INSERT INTO lab.cohorts(organization_id,experiment_id) VALUES(other_org,e);
 EXCEPTION WHEN foreign_key_violation THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'cross-tenant cohort hierarchy accepted'; END IF;
 rejected:=false;
 BEGIN
  PERFORM lab.apply_credit_event(o,e,gen_random_uuid(),'reserve',501,'budget-over-000001');
 EXCEPTION WHEN OTHERS THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'experiment budget overspend accepted'; END IF;
 RAISE NOTICE 'PASS lab credit reservation, replay, capture, release, reconciliation, isolation, conflict, overspend';
END $test$;
ROLLBACK;
