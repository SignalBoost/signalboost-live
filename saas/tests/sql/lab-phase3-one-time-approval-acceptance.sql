-- Disposable test database only. The migration must be installed first.
BEGIN;
DO $phase3$
DECLARE
 org uuid:=gen_random_uuid(); university uuid:=gen_random_uuid();
 project uuid:=gen_random_uuid(); experiment uuid:=gen_random_uuid();
 cohort uuid:=gen_random_uuid(); artifact uuid:=gen_random_uuid();
 human uuid:=gen_random_uuid(); ref text; dig text:=repeat('a',64);
 ok boolean;
BEGIN
 INSERT INTO auth.users(id) VALUES(human);
 INSERT INTO lab.organizations(id,name) VALUES(org,'phase3-approval-owner');
 INSERT INTO lab.universities(id,organization_id,name) VALUES(university,org,'test');
 INSERT INTO lab.projects(id,organization_id,university_id,name) VALUES(project,org,university,'test');
 INSERT INTO lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 VALUES(experiment,org,project,'PRIVATE',0);
 INSERT INTO lab.cohorts(id,organization_id,experiment_id) VALUES(cohort,org,experiment);
 INSERT INTO lab.artifacts(permanent_artifact_id,organization_id,cohort_id,fingerprint_sha256)
 VALUES(artifact,org,cohort,repeat('a',64));
 ref:='vault://' || org::text || '/teacher';
 INSERT INTO lab.provider_human_approvals
 (approval_id,organization_id,permanent_artifact_id,provider_id,capability,
  harness_run_id,action_id,secret_reference,action_digest,expires_at,approved_by)
 VALUES('approve-1',org,artifact,'provider-a','teacher.invoke','run-1','action-1',
  ref,dig,clock_timestamp()+interval '1 hour',human);
 SELECT lab.consume_provider_human_approval('approve-1',org,artifact,
  'provider-b','teacher.invoke','run-1','action-1',ref,dig) INTO ok;
 IF ok THEN RAISE EXCEPTION 'FAIL: wrong provider consumed approval'; END IF;
 SELECT lab.consume_provider_human_approval('approve-1',org,artifact,
  'provider-a','teacher.invoke','run-1','action-1',ref,repeat('0',64)) INTO ok;
 IF ok THEN RAISE EXCEPTION 'FAIL: wrong digest consumed approval'; END IF;
 SELECT lab.consume_provider_human_approval('approve-1',org,artifact,
  'provider-a','teacher.invoke','run-1','action-1',ref,dig) INTO ok;
 IF NOT ok THEN RAISE EXCEPTION 'FAIL: first valid consumption rejected'; END IF;
 SELECT lab.consume_provider_human_approval('approve-1',org,artifact,
  'provider-a','teacher.invoke','run-1','action-1',ref,dig) INTO ok;
 IF ok THEN RAISE EXCEPTION 'FAIL: replay accepted'; END IF;
 IF (SELECT consumed_at IS NULL FROM lab.provider_human_approvals
  WHERE approval_id='approve-1') THEN RAISE EXCEPTION 'FAIL: consumption not persisted'; END IF;
 INSERT INTO lab.provider_human_approvals
 (approval_id,organization_id,permanent_artifact_id,provider_id,capability,
  harness_run_id,action_id,secret_reference,action_digest,expires_at,approved_by,revoked_at)
 VALUES('approve-2',org,artifact,'provider-a','teacher.invoke','run-1','action-2',
  ref,dig,clock_timestamp()+interval '1 hour',human,clock_timestamp());
 SELECT lab.consume_provider_human_approval('approve-2',org,artifact,
  'provider-a','teacher.invoke','run-1','action-2',ref,dig) INTO ok;
 IF ok THEN RAISE EXCEPTION 'FAIL: revoked approval accepted'; END IF;
 IF has_table_privilege('authenticated','lab.provider_human_approvals','SELECT')
    OR has_table_privilege('anon','lab.provider_human_approvals','INSERT')
    OR has_function_privilege('authenticated',
      'public.itmounts_lab_consume_provider_human_approval(text,uuid,uuid,text,text,text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'FAIL: public or authenticated privilege leaked'; END IF;
 RAISE NOTICE 'PASS Phase 3 approval: exact scope, one use, no replay, revoked denied, no client privilege';
END $phase3$;
ROLLBACK;
