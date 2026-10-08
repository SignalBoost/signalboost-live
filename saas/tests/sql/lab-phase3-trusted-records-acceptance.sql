-- Phase 3 adversarial proof: scoped grants and consent never cross organization.
-- Disposable database only; rollback every fixture. Not a live consent issuance proof.
BEGIN;
DO $phase3$
DECLARE
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid();
  ua uuid:=gen_random_uuid(); ub uuid:=gen_random_uuid();
  pa uuid:=gen_random_uuid(); pb uuid:=gen_random_uuid();
  ea uuid:=gen_random_uuid(); eb uuid:=gen_random_uuid();
  ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid();
  aa uuid:=gen_random_uuid(); ab uuid:=gen_random_uuid();
  actor uuid:=gen_random_uuid();
  denied boolean;
BEGIN
 INSERT INTO auth.users(id) VALUES(actor);
 INSERT INTO lab.organizations(id,name) VALUES(a,'phase3-A'),(b,'phase3-B');
 INSERT INTO lab.universities(id,organization_id,name) VALUES(ua,a,'A'),(ub,b,'B');
 INSERT INTO lab.projects(id,organization_id,university_id,name) VALUES(pa,a,ua,'A'),(pb,b,ub,'B');
 INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 VALUES(ea,a,pa,'RESEARCH_OPT_IN',0),(eb,b,pb,'PRIVATE',0);
 INSERT INTO lab.cohorts(id,organization_id,experiment_id) VALUES(ca,a,ea),(cb,b,eb);
 INSERT INTO lab.artifacts(permanent_artifact_id,organization_id,cohort_id,fingerprint_sha256)
 VALUES(aa,a,ca,repeat('a',64)),(ab,b,cb,repeat('b',64));
 INSERT INTO lab.research_consents(organization_id,experiment_id,granted_by,destination_organization_id,rights_cleared,consent_granted)
 VALUES(a,ea,actor,b,true,true);
 INSERT INTO lab.provider_grants(organization_id,provider_id,permanent_artifact_id,capability,secret_reference,expires_at)
 VALUES(a,'provider-a',aa,'teacher.invoke','vault://' || a || '/teacher',now()+interval '1 day');

 denied:=false;
 BEGIN
   INSERT INTO lab.research_consents(organization_id,experiment_id,granted_by,destination_organization_id,rights_cleared,consent_granted)
   VALUES(b,ea,actor,a,true,true);
 EXCEPTION WHEN foreign_key_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: forged tenant consent foreign experiment accepted'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO lab.provider_grants(organization_id,provider_id,permanent_artifact_id,capability,secret_reference,expires_at)
   VALUES(b,'provider-b',aa,'compute.execute','vault://' || b || '/gpu',now()+interval '1 day');
 EXCEPTION WHEN foreign_key_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: cross-tenant artifact grant accepted'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO lab.provider_grants(organization_id,provider_id,permanent_artifact_id,capability,secret_reference,expires_at)
   VALUES(a,'provider-a',aa,'teacher.invoke','vault://' || b || '/stolen',now()+interval '1 day');
 EXCEPTION WHEN check_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: other tenant vault reference accepted'; END IF;

 denied:=false;
 BEGIN
   INSERT INTO lab.provider_grants(organization_id,provider_id,permanent_artifact_id,capability,secret_reference,expires_at)
   VALUES(a,'provider-a',aa,'teacher.invoke','plaintext-secret',now()+interval '1 day');
 EXCEPTION WHEN check_violation THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'FAIL: plaintext secret accepted'; END IF;

 IF EXISTS(SELECT 1 FROM lab.provider_grants WHERE secret_reference !~ '^vault://') THEN
   RAISE EXCEPTION 'FAIL: non-opaque credential retained'; END IF;
 IF has_table_privilege('authenticated','lab.provider_grants','SELECT') OR
    has_table_privilege('anon','lab.provider_grants','SELECT') OR
    has_table_privilege('service_role','lab.provider_grants','SELECT') OR
    has_table_privilege('authenticated','lab.research_consents','SELECT') THEN
   RAISE EXCEPTION 'FAIL: sensitive Phase 3 table directly readable'; END IF;
 RAISE NOTICE 'PASS Phase 3: independent consent and provider grant foreign keys, vault namespace, opaque secrets, restrictive permissions';
END $phase3$;
ROLLBACK;
