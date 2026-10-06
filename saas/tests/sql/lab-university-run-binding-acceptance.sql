-- Transactional acceptance for the Lab-to-University binding. No persistent fixtures.
BEGIN;
DO $test$
DECLARE
 o uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
 e uuid:=gen_random_uuid(); wrong uuid:=gen_random_uuid(); missing_run uuid:=gen_random_uuid();
 denied boolean:=false; real_run uuid; other_experiment uuid:=gen_random_uuid();
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
 -- Bind an existing University run only inside this rolled-back transaction.
 SELECT r.id INTO real_run FROM public.cos_university_mass_distillation_batch_runs r
 WHERE NOT EXISTS(SELECT 1 FROM lab.university_run_bindings b WHERE b.run_id=r.id)
 ORDER BY r.created_at DESC LIMIT 1;
 IF real_run IS NULL THEN RAISE EXCEPTION 'no unbound University run fixture available'; END IF;
 PERFORM lab.bind_university_run(real_run,o,e);
 PERFORM lab.bind_university_run(real_run,o,e);
 IF (SELECT count(*) FROM lab.university_run_bindings WHERE run_id=real_run) <> 1 THEN
   RAISE EXCEPTION 'idempotent binding replay duplicated rows'; END IF;
 INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 VALUES(other_experiment,o,p,'PRIVATE',100);
 denied:=false;
 BEGIN
   PERFORM lab.bind_university_run(real_run,o,other_experiment);
 EXCEPTION WHEN raise_exception THEN denied := SQLERRM='lab_university_run_binding_conflict'; END;
 IF NOT denied THEN RAISE EXCEPTION 'conflicting ownership accepted'; END IF;
 IF (SELECT experiment_id FROM lab.university_run_bindings WHERE run_id=real_run) IS DISTINCT FROM e THEN
   RAISE EXCEPTION 'binding changed after conflict'; END IF;
END $test$;
ROLLBACK;
