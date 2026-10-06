-- Phase 3/4 adversarial acceptance. Execute on an isolated PostgreSQL database after
-- both Lab migrations. Fixtures roll back. This is NOT a portability or commercial certification.
BEGIN;
DO $acceptance$
DECLARE
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
  ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid();
  pa uuid:=gen_random_uuid(); pb uuid:=gen_random_uuid();
  ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid();
  ca uuid:=gen_random_uuid(); ra uuid:=gen_random_uuid();
  receipt jsonb; denied boolean; reconciled jsonb;
BEGIN
  INSERT INTO lab.organizations(id,name) VALUES(a,'adversarial-A'),(b,'adversarial-B');
  INSERT INTO lab.universities(id,organization_id,name) VALUES(ua,a,'A'),(ub,b,'B');
  INSERT INTO lab.projects(id,organization_id,university_id,name) VALUES(pa,a,ua,'A'),(pb,b,ub,'B');
  INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
    VALUES(ea,a,pa,'PRIVATE',900),(eb,b,pb,'AGGREGATE_METRICS',900);
  INSERT INTO lab.credit_accounts(organization_id,funded_microcredits) VALUES(a,900),(b,900);
  -- A forged cross-tenant parent cannot be inserted despite a valid foreign key UUID.
  denied:=false;
  BEGIN
    INSERT INTO lab.projects(organization_id,university_id,name) VALUES(a,ub,'cross-tenant');
  EXCEPTION WHEN foreign_key_violation THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: cross-tenant project admitted'; END IF;
  denied:=false;
  BEGIN
    INSERT INTO lab.cohorts(id,organization_id,experiment_id) VALUES(ca,a,eb);
  EXCEPTION WHEN foreign_key_violation THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: cross-tenant cohort admitted'; END IF;
  INSERT INTO lab.cohorts(id,organization_id,experiment_id) VALUES(ca,a,ea);
  denied:=false;
  BEGIN
    INSERT INTO lab.artifacts(permanent_artifact_id,organization_id,cohort_id,fingerprint_sha256)
      VALUES(gen_random_uuid(),b,ca,repeat('a',64));
  EXCEPTION WHEN foreign_key_violation THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: cross-tenant artifact admitted'; END IF;
  PERFORM set_config('lab.trusted_organization_id',a::text,true);
  receipt:=lab.apply_credit_event(a,ea,ra,'reserve',600,'phase4-reserve-00001');
  IF (receipt->>'replayed')::boolean THEN RAISE EXCEPTION 'FAIL: first reservation replayed'; END IF;
  receipt:=lab.apply_credit_event(a,ea,ra,'reserve',600,'phase4-reserve-00001');
  IF NOT (receipt->>'replayed')::boolean THEN RAISE EXCEPTION 'FAIL: reservation retry not idempotent'; END IF;
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(a,ea,ra,'capture',601,'phase4-overcapture-01',1.0,'cost-ref-1');
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: overcapture allowed'; END IF;
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(a,ea,ra,'capture',1,'phase4-missing-cost',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: unmeasured capture allowed'; END IF;
  PERFORM lab.apply_credit_event(a,ea,ra,'capture',300,'phase4-capture-00001',0.123456789,'provider-receipt-1');
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(a,ea,ra,'refund',100,'phase4-wrong-refund',NULL,NULL,'CUSTOMER_INFRA_FAILURE');
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: customer fault refunded'; END IF;
  PERFORM lab.apply_credit_event(a,ea,ra,'refund',100,'phase4-platform-refund',NULL,NULL,'PLATFORM_FAILURE');
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(a,ea,ra,'refund',201,'phase4-excess-refund',NULL,NULL,'PLATFORM_FAILURE');
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: refund exceeded capture'; END IF;
  PERFORM lab.apply_credit_event(a,ea,ra,'release',300,'phase4-release-00001');
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(a,ea,ra,'release',1,'phase4-double-release');
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: release exceeded reserve'; END IF;
  denied:=false;
  BEGIN
    PERFORM lab.apply_credit_event(b,eb,ra,'capture',1,'phase4-tenant-spoof',0.1,'foreign-receipt');
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: foreign tenant authority accepted'; END IF;
  reconciled:=lab.reconcile_credit_account(a);
  IF NOT (reconciled->>'pass')::boolean THEN RAISE EXCEPTION 'FAIL: ledger reconciliation %',reconciled; END IF;
  IF (reconciled->>'stored_reserved')::bigint<>0 OR
     (reconciled->>'stored_captured')::bigint<>300 OR
     (reconciled->>'stored_refunded')::bigint<>100 THEN
    RAISE EXCEPTION 'FAIL: incorrect ledger balances %',reconciled;
  END IF;
  denied:=false;
  BEGIN
    UPDATE lab.credit_events SET amount_microcredits=1 WHERE reservation_id=ra;
  EXCEPTION WHEN OTHERS THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'FAIL: append-only credit events mutable'; END IF;
  RAISE NOTICE 'PASS: tenant FK isolation, atomic bounds, measured capture, refund classification, idempotency, append-only and reconciliation';
END $acceptance$;
ROLLBACK;
