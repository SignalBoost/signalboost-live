-- Intentionally raises after reporting: ALL fixture writes roll back. Not academic evidence.
DO $proof$
DECLARE
  case_name text;
  owner_id text;
  plan_id uuid;
  queue_id uuid;
  turn_id uuid;
  skill_key_value text;
  observed timestamptz := now() - interval '2 minutes';
  metadata_value jsonb;
  evidence_value jsonb;
  proof_value jsonb;
  response jsonb;
  expected_error text;
  actual_error text;
  passed_case boolean;
  report text := '';
  cases text[] := ARRAY['specialist_pass','specialist_failure','cos_pass','generic_pass',
    'wrong_agent','wrong_manifest','missing_provenance','stale_round','restudy','missing_source',
    'empty_evidence','wrong_skill','wrong_role','duplicate_result','missing_agent'];
BEGIN
  FOREACH case_name IN ARRAY cases LOOP
    BEGIN
      owner_id := CASE WHEN case_name IN ('cos_pass','generic_pass') THEN 'cos'
        WHEN case_name='wrong_role' THEN 'university-proof-unregistered' ELSE 'software-specialist' END;
      plan_id := gen_random_uuid(); queue_id := gen_random_uuid(); turn_id := gen_random_uuid();
      skill_key_value := 'bound-practice-schema-proof:' || queue_id::text;
      proof_value := jsonb_build_object('studyAttempt',1,'source','continuous_learning_accepted_gap',
        'academicCredit',false,'evidenceRefs',jsonb_build_array('isolated-schema-fixture-not-study'), 'observedAt',observed);
      metadata_value := jsonb_build_object('origin','cos_university_deliberate_practice','agentId',owner_id,
        'executionBinding','agent_bound_practice_v1','universityPlanId',plan_id,'practiceRound',1,
        'manifestHash',repeat('a',64));
      evidence_value := jsonb_build_object('origin','cos_university_deliberate_practice','academicCredit',false,
        'reason','schema_fixture','turnId',turn_id,'responseSource','university_software_specialist_v1',
        'executionProvenance',jsonb_build_object('runtime','university_software_specialist_v1',
          'role','software_engineering','agentId',owner_id,'runId',queue_id,'turnId',turn_id,
          'manifestHash',repeat('a',64),'model','schema-proof-not-inference','promptHash',repeat('b',64),
          'responseHash',repeat('c',64),'contextHash',repeat('d',64),'academicAuthority','none',
          'startedAt',observed,'completedAt',observed+interval '1 second'));
      INSERT INTO public.cos_cognitive_skills(skill_key,subject,title,metadata,provenance)
        VALUES(skill_key_value,'schema-proof','isolated schema fixture',metadata_value,metadata_value);
      INSERT INTO public.cos_university_study_plans(id,plan_key,agent_id,subject_id,failure_class,source_kind,
        objective,status,attempt_count,last_attempt_at,methods,evidence)
        VALUES(plan_id,'bound-practice-schema-proof:'||plan_id::text,owner_id,'computer_science','unknown',
          'academic_rotation','isolated schema fixture, never academic work','studying',1,observed,
          '[{"id":"deliberate_practice","execution":"automatic_if_certifiable"}]'::jsonb,
          jsonb_build_object('studyProof',proof_value));
      expected_error := NULL;
      CASE case_name
        WHEN 'wrong_agent' THEN
          metadata_value := metadata_value || '{"agentId":"cos"}'::jsonb;
          expected_error := 'university_practice_plan_round_fence_failed';
        WHEN 'wrong_manifest' THEN
          evidence_value := jsonb_set(evidence_value,'{executionProvenance,manifestHash}',to_jsonb(repeat('f',64)));
          expected_error := 'university_practice_execution_binding_invalid';
        WHEN 'missing_provenance' THEN
          evidence_value := evidence_value - 'executionProvenance';
          expected_error := 'university_practice_execution_binding_invalid';
        WHEN 'stale_round' THEN
          metadata_value := metadata_value || '{"practiceRound":2}'::jsonb;
          expected_error := 'university_practice_plan_round_fence_failed';
        WHEN 'restudy' THEN
          UPDATE public.cos_university_study_plans SET evidence=evidence||
            '{"practiceRemediation":{"practiceRound":1,"requiresNewStudyAttempt":true}}'::jsonb WHERE id=plan_id;
          expected_error := 'university_practice_restudy_required';
        WHEN 'missing_source' THEN
          UPDATE public.cos_university_study_plans SET evidence=jsonb_build_object('studyProof',proof_value-'source') WHERE id=plan_id;
          expected_error := 'university_practice_study_proof_fence_failed';
        WHEN 'empty_evidence' THEN
          UPDATE public.cos_university_study_plans SET evidence=jsonb_build_object('studyProof',proof_value||'{"evidenceRefs":[]}'::jsonb) WHERE id=plan_id;
          expected_error := 'university_practice_study_proof_evidence_required';
        WHEN 'wrong_skill' THEN
          UPDATE public.cos_cognitive_skills SET metadata=metadata||'{"agentId":"other-agent"}'::jsonb WHERE skill_key=skill_key_value;
          expected_error := 'university_practice_skill_binding_invalid';
        WHEN 'wrong_role' THEN expected_error := 'university_practice_registered_executor_required';
        WHEN 'missing_agent' THEN
          metadata_value := metadata_value - 'agentId';
          expected_error := 'university_practice_agent_identity_required';
        WHEN 'generic_pass' THEN metadata_value := '{}'::jsonb; evidence_value := '{}'::jsonb;
        WHEN 'cos_pass' THEN evidence_value := '{"responseSource":"cos_local_reasoner","academicCredit":false}'::jsonb;
        ELSE NULL;
      END CASE;
      INSERT INTO public.cos_active_practice_queue(id,skill_key,variant_key,exercise_kind,prompt,
        generation_source,status,max_attempts,metadata)
        VALUES(queue_id,skill_key_value,'fixture','practice','isolated schema fixture','curated','running',1,metadata_value);
      actual_error := NULL;
      BEGIN
        response := public.cos_record_cognitive_practice_result(queue_id,case_name<>'specialist_failure',0.5,'schema fixture',evidence_value);
      EXCEPTION WHEN OTHERS THEN actual_error := SQLERRM;
      END;
      passed_case := actual_error IS NOT DISTINCT FROM expected_error;
      IF expected_error IS NOT NULL THEN
        passed_case := passed_case AND (SELECT status='running' AND attempt_count=0 FROM public.cos_active_practice_queue WHERE id=queue_id)
          AND NOT EXISTS(SELECT 1 FROM public.cos_cognitive_experiences WHERE source_ref='cos_active_practice_queue:'||queue_id::text);
      ELSIF actual_error IS NULL THEN
        passed_case := passed_case AND response->>'queueStatus'=CASE WHEN case_name='specialist_failure' THEN 'failed' ELSE 'passed' END
          AND (SELECT count(*)=1 FROM public.cos_cognitive_experiences WHERE source_ref='cos_active_practice_queue:'||queue_id::text);
        IF case_name='specialist_failure' THEN
          passed_case := passed_case AND (SELECT last_attempt_at IS NULL
            AND evidence->'practiceRemediation'->'requiresNewStudyAttempt'='true'::jsonb
            AND evidence->'practiceRemediation'->'requiresIndependentRetest'='true'::jsonb
            AND evidence->'studyProof'=proof_value FROM public.cos_university_study_plans WHERE id=plan_id);
        END IF;
        IF case_name='duplicate_result' THEN
          actual_error := NULL;
          BEGIN
            PERFORM public.cos_record_cognitive_practice_result(queue_id,true,0.5,'schema fixture',evidence_value);
          EXCEPTION WHEN OTHERS THEN actual_error := SQLERRM;
          END;
          passed_case := passed_case AND actual_error='practice_item_not_running'
            AND (SELECT count(*)=1 FROM public.cos_cognitive_experiences WHERE source_ref='cos_active_practice_queue:'||queue_id::text);
        END IF;
      END IF;
      report := report || ' ['||case_name||': '||CASE WHEN passed_case IS TRUE THEN 'PASS' ELSE 'FAIL '||coalesce(actual_error,'unexpected state') END||']';
      RAISE EXCEPTION USING ERRCODE='ZP001',MESSAGE='rollback isolated fixture';
    EXCEPTION WHEN SQLSTATE 'ZP001' THEN NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'BOUND PRACTICE DATABASE PROOF (ALL FIXTURE WRITES ROLLED BACK; NO ACADEMIC EXECUTION):%',report;
END $proof$;
