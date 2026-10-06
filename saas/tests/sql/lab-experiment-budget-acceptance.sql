-- Run after the Lab ledger and experiment-budget migration. All fixtures roll back.
BEGIN;
DO $test$
DECLARE o uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); p uuid:=gen_random_uuid();
 e uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); denied boolean:=false;
BEGIN
 INSERT INTO lab.organizations(id,name) VALUES(o,'budget-acceptance');
 INSERT INTO lab.universities(id,organization_id,name) VALUES(u,o,'budget-acceptance');
 INSERT INTO lab.projects(id,organization_id,university_id,name) VALUES(p,o,u,'budget-acceptance');
 INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits) VALUES(e,o,p,'PRIVATE',100);
 INSERT INTO lab.credit_accounts(organization_id,funded_microcredits) VALUES(o,1000);
 PERFORM set_config('lab.trusted_organization_id',o::text,true);
 PERFORM lab.apply_credit_event(o,e,r,'reserve',70,'budget-reserve-00001');
 BEGIN
  PERFORM lab.apply_credit_event(o,e,gen_random_uuid(),'reserve',31,'budget-exceed-00001');
 EXCEPTION WHEN raise_exception THEN
  denied := SQLERRM='lab_experiment_budget_exceeded';
 END;
 IF NOT denied THEN RAISE EXCEPTION 'experiment budget bypassed'; END IF;
 PERFORM lab.apply_credit_event(o,e,r,'release',70,'budget-release-00001');
 -- A release frees the account hold, but must not erase experiment spending authorization history.
 denied:=false;
 BEGIN
  PERFORM lab.apply_credit_event(o,e,gen_random_uuid(),'reserve',31,'budget-reuse-000001');
 EXCEPTION WHEN raise_exception THEN
  denied := SQLERRM='lab_experiment_budget_exceeded';
 END;
 IF NOT denied THEN RAISE EXCEPTION 'experiment cap reused after release'; END IF;
 IF NOT (lab.reconcile_credit_account(o)->>'pass')::boolean THEN RAISE EXCEPTION 'reconciliation failed'; END IF;
END $test$;
ROLLBACK;