-- Phase 4: recorded capture cost is required, immutable, and idempotency-bound.
-- Synthetic cost references prove the ledger contract, NOT real provider economics.
BEGIN;
DO $verify$
DECLARE
  org uuid:=gen_random_uuid(); uni uuid:=gen_random_uuid(); proj uuid:=gen_random_uuid();
  exp uuid:=gen_random_uuid(); res uuid:=gen_random_uuid(); replay jsonb;
  denied boolean;
BEGIN
  INSERT INTO lab.organizations(id,name) VALUES(org,'measured-capture-contract');
  INSERT INTO lab.universities(id,organization_id,name) VALUES(uni,org,'measured-capture-contract');
  INSERT INTO lab.projects(id,organization_id,university_id,name) VALUES(proj,org,uni,'measured-capture-contract');
  INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
    VALUES(exp,org,proj,'PRIVATE',1000);
  INSERT INTO lab.credit_accounts(organization_id,funded_microcredits) VALUES(org,1000);
  PERFORM set_config('lab.trusted_organization_id',org::text,true);
  PERFORM lab.apply_credit_event(org,exp,res,'reserve',500,'phase4-measured-reserve-001');
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(org,exp,res,'capture',100,'phase4-measured-empty-00001');
  EXCEPTION WHEN OTHERS THEN denied:=(SQLERRM='lab_capture_requires_measured_cost');
  END;
  IF NOT denied THEN RAISE EXCEPTION 'capture without measured receipt was accepted'; END IF;
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(org,exp,res,'capture',100,'phase4-measured-negative001',-0.1,'synthetic-usage-ref');
  EXCEPTION WHEN OTHERS THEN denied:=(SQLERRM='lab_capture_requires_measured_cost');
  END;
  IF NOT denied THEN RAISE EXCEPTION 'negative measured cost was accepted'; END IF;
  PERFORM lab.apply_credit_event(org,exp,res,'capture',100,'phase4-measured-capture-001',0.125,'synthetic-usage-ref');
  replay:=lab.apply_credit_event(org,exp,res,'capture',100,'phase4-measured-capture-001',0.125,'synthetic-usage-ref');
  IF NOT (replay->>'replayed')::boolean THEN RAISE EXCEPTION 'identical receipt replay not idempotent'; END IF;
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(org,exp,res,'capture',100,'phase4-measured-capture-001',0.250,'synthetic-usage-ref');
  EXCEPTION WHEN OTHERS THEN denied:=(SQLERRM='lab_idempotency_conflict');
  END;
  IF NOT denied THEN RAISE EXCEPTION 'cost-altered replay accepted'; END IF;
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(org,exp,res,'capture',100,'phase4-measured-capture-001',0.125,'changed-usage-ref');
  EXCEPTION WHEN OTHERS THEN denied:=(SQLERRM='lab_idempotency_conflict');
  END;
  IF NOT denied THEN RAISE EXCEPTION 'receipt reference-altered replay accepted'; END IF;
  denied:=false;
  BEGIN
    UPDATE lab.credit_events SET measured_cost_usd=0 WHERE organization_id=org;
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'append-only cost history was mutable'; END IF;
  IF (SELECT count(*) FROM lab.credit_events WHERE organization_id=org AND operation='capture')<>1
    THEN RAISE EXCEPTION 'invalid captures changed event history'; END IF;
  IF NOT (lab.reconcile_credit_account(org)->>'pass')::boolean
    THEN RAISE EXCEPTION 'reconciliation failed'; END IF;
  RAISE NOTICE 'PASS synthetic measured-cost receipt contract, replay conflict, append-only and reconciliation';
END $verify$;
ROLLBACK;
