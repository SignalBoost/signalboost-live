-- Transactional acceptance for the Lab-to-University binding. No persistent fixtures.
BEGIN;
DO $test$
DECLARE
 o uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
 e uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); missing_run uuid:=gen_random_uuid();
 denied boolean:=false;
BEGIN
 INSERT INTO lab.organizations(id,name) VALUES(o,'run-binding-acceptance');
 INSERT INTO lab.universities(id,organization_id,name) VALUES(u,o,'run-binding-acceptance');
 INSERT INTO lab.projects(id,organization_id,university_id,name) VALUES(p,o,u,'run-binding-acceptance');
 INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 VALUES(e,o,p,'PRIVATE',100);
 -- No tenant assertion: reject.
 BEGIN
   PERFORM lab.bind_university_run(missing_run,o,e);
 EXCEPTION WHEN raise_exception THEN denied := SQLERRM='lab_tenant_authority_denied'; END;
 IF NOT denied THEN RAISE EXCEPTION 'untrusted binding accepted'; END IF;
 -- Wrong tenant assertion: reject.
 PERFORM set_config('lab.trusted_organization_id',wrong::text,true);
 denied:=false;
 BEGIN
   PERFORM lab.bind_university_run(missing_run,o,e);
 EXCEPTION WHEN raise_exception THEN denied := SQLERRM='lab_tenant_authority_denied'; END;
 IF NOT denied THEN RAISE EXCEPTION 'cross-tenant binding accepted'; END IF;
 -- Correct tenant, nonexistent run: reject without writing a mapping.
 PERFORM set_config('lab.trusted_organization_id',o::text,true);
 denied:=false;
 BEGIN
   PERFORM lab.bind_university_run(missing_run,o,e);
 EXCEPTION WHEN raise_exception THEN denied := SQLERRM='lab_university_run_missing'; END;
 IF NOT denied THEN RAISE EXCEPTION 'nonexistent run bound'; END IF;
 IF EXISTS(SELECT 1 FROM lab.university_run_bindings WHERE run_id=missing_run) THEN
   RAISE EXCEPTION 'rejected run binding persisted';
 END IF;
END $test$;
ROLLBACK;
