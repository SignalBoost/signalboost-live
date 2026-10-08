-- Phase 3 / tenant hierarchy adversarial negative and positive tests.
-- Disposable database only. Requires Lab migrations, uuid extension and trusted test role.
-- All fixtures are rolled back; no University scheduling or training is invoked.
BEGIN;
DO $phase3_tenants$
DECLARE
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
 ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid();
 pa uuid:=gen_random_uuid(); pb uuid:=gen_random_uuid();
 ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid();
 ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid();
 denied boolean;
BEGIN
 INSERT INTO lab.organizations(id,name) VALUES(a,'phase3-tenant-A'),(b,'phase3-tenant-B');
 INSERT INTO lab.universities(id,organization_id,name) VALUES(ua,a,'A University'),(ub,b,'B University');
 INSERT INTO lab.projects(id,organization_id,university_id,name) VALUES(pa,a,ua,'A Project'),(pb,b,ub,'B Project');
 INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 VALUES(ea,a,pa,'PRIVATE',100),(eb,b,pb,'RESEARCH_OPT_IN',100);
 INSERT INTO lab.cohorts(id,organization_id,experiment_id) VALUES(ca,a,ea),(cb,b,eb);
 INSERT INTO lab.artifacts(permanent_artifact_id,organization_id,cohort_id,fingerprint_sha256)
 VALUES(gen_random_uuid(),a,ca,repeat('a',64)),(gen_random_uuid(),b,cb,repeat('b',64));
 IF (SELECT count(*) FROM lab.artifacts WHERE organization_id IN(a,b)) <> 2 THEN
   RAISE EXCEPTION 'FAIL: separate valid artifact chains missing';
 END IF;

 denied:=false;
 BEGIN
   INSERT INTO lab.projects(organization_id,university_id,name) VALUES (a,ub,'forged university');
 EXCEPTION WHEN foreign_key_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: cross-organization university accepted'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO lab.experiments(organization_id,project_id,privacy_tier,budget_microcredits)
   VALUES(a,pb,'PRIVATE',100);
 EXCEPTION WHEN foreign_key_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: cross-organization project accepted'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO lab.cohorts(organization_id,experiment_id) VALUES(a,eb);
 EXCEPTION WHEN foreign_key_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: cross-organization experiment accepted'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO lab.artifacts(permanent_artifact_id,organization_id,cohort_id,fingerprint_sha256)
   VALUES(gen_random_uuid(),a,cb,repeat('c',64));
 EXCEPTION WHEN foreign_key_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: cross-organization cohort accepted'; END IF;

 denied:=false;
 BEGIN
   UPDATE lab.experiments SET privacy_tier='INVENTED' WHERE id=ea;
 EXCEPTION WHEN check_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: undefined privacy tier accepted'; END IF;

 IF (SELECT privacy_tier FROM lab.experiments WHERE id=ea) <> 'PRIVATE'
   OR (SELECT privacy_tier FROM lab.experiments WHERE id=eb) <> 'RESEARCH_OPT_IN' THEN
   RAISE EXCEPTION 'FAIL: per-tenant privacy tier corrupted';
 END IF;
 RAISE NOTICE 'PASS: two distinct complete Lab chains; foreign-tenant parents rejected at all levels; tier constraints hold';
END $phase3_tenants$;
ROLLBACK;
