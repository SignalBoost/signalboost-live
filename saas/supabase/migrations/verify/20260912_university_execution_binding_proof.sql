-- saas/supabase/migrations/verify/20260912_university_execution_binding_proof.sql
-- Functional proof of the binding, run through Hub -> Run Migration AFTER the apply file.
-- IT WRITES NOTHING: every case runs inside one transaction that the final RAISE aborts, so the
-- result comes back as an "error" string starting with UNIVERSITY BINDING PROOF. That string IS
-- the result. Every check must read PASS.
DO $proof$
DECLARE
  v_id uuid;
  v_agent text;
  v_turn uuid := gen_random_uuid();
  v_before bigint;
  v_after bigint;
  v_report text := '';
  v_case text;
BEGIN
  SELECT count(*) INTO v_before FROM public.cos_university_exam_runs;

  -- 1. Legacy COS run key keeps COS ownership (historical records are not reassigned).
  INSERT INTO public.cos_university_exam_runs
    (run_key, profile, scorer_version, seed, manifest_hash, target_kind, subject_id)
  VALUES ('cos_university_unseen_v1:2026-01-01:subject:computer_science',
          'cos_university_unseen_v1', 'proof', 'proof-seed', 'proof-manifest', 'subject', 'computer_science')
  RETURNING agent_id INTO v_agent;
  v_report := v_report || ' [1 legacy_cos_ownership: ' ||
    CASE WHEN v_agent = 'cos' THEN 'PASS' ELSE 'FAIL got=' || coalesce(v_agent, 'NULL') END || ']';

  -- 2. Specialist run key derives the specialist as owner.
  INSERT INTO public.cos_university_exam_runs
    (run_key, profile, scorer_version, seed, manifest_hash, target_kind, subject_id)
  VALUES ('cos_university_unseen_v1:software-specialist:2026-01-01:subject:computer_science',
          'cos_university_unseen_v1', 'proof', 'proof-seed', 'proof-manifest', 'subject', 'computer_science')
  RETURNING id, agent_id INTO v_id, v_agent;
  v_report := v_report || ' [2 specialist_ownership: ' ||
    CASE WHEN v_agent = 'software-specialist' THEN 'PASS' ELSE 'FAIL got=' || coalesce(v_agent, 'NULL') END || ']';

  -- 3. An unparseable run key cannot own a run at all.
  BEGIN
    INSERT INTO public.cos_university_exam_runs
      (run_key, profile, scorer_version, seed, manifest_hash, target_kind, subject_id)
    VALUES ('not-a-host-run-key', 'cos_university_unseen_v1', 'proof', 'proof-seed', 'proof-manifest',
            'subject', 'computer_science');
    v_case := 'FAIL accepted';
  EXCEPTION WHEN check_violation THEN v_case := 'PASS rejected';
  END;
  v_report := v_report || ' [3 unowned_run_rejected: ' || v_case || ']';

  -- 4. Forged provenance on a real specialist run is rejected.
  BEGIN
    UPDATE public.cos_university_exam_runs
      SET execution_provenance = '{"runtime":"forged","agentId":"software-specialist"}'::jsonb
      WHERE id = v_id;
    v_case := 'FAIL accepted';
  EXCEPTION WHEN check_violation THEN v_case := 'PASS rejected';
  END;
  v_report := v_report || ' [4 forged_binding_rejected: ' || v_case || ']';

  -- 5. Provenance naming a different agent than the run owner is rejected.
  BEGIN
    UPDATE public.cos_university_exam_runs SET
      status = 'passed', passed = true, turn_id = v_turn,
      response_source = 'university_software_specialist_v1',
      local_model_invoked = true, external_ai_invoked = false, fresh_execution = true,
      execution_provenance = jsonb_build_object(
        'runtime', 'university_software_specialist_v1', 'role', 'software_engineering',
        'agentId', 'someone-else', 'runId', v_id::text, 'turnId', v_turn::text,
        'manifestHash', 'proof-manifest', 'model', 'proof-model',
        'promptHash', repeat('a', 64), 'responseHash', repeat('b', 64), 'contextHash', repeat('c', 64),
        'academicAuthority', 'none')
      WHERE id = v_id;
    v_case := 'FAIL accepted';
  EXCEPTION WHEN check_violation THEN v_case := 'PASS rejected';
  END;
  v_report := v_report || ' [5 wrong_agent_binding_rejected: ' || v_case || ']';

  -- 6. A complete, self-consistent binding is accepted.
  BEGIN
    UPDATE public.cos_university_exam_runs SET
      status = 'passed', passed = true, turn_id = v_turn,
      response_source = 'university_software_specialist_v1',
      local_model_invoked = true, external_ai_invoked = false, fresh_execution = true,
      execution_provenance = jsonb_build_object(
        'runtime', 'university_software_specialist_v1', 'role', 'software_engineering',
        'agentId', 'software-specialist', 'runId', v_id::text, 'turnId', v_turn::text,
        'manifestHash', 'proof-manifest', 'model', 'proof-model',
        'promptHash', repeat('a', 64), 'responseHash', repeat('b', 64), 'contextHash', repeat('c', 64),
        'academicAuthority', 'none')
      WHERE id = v_id;
    v_case := 'PASS accepted';
  EXCEPTION WHEN check_violation THEN v_case := 'FAIL rejected: ' || SQLERRM;
  END;
  v_report := v_report || ' [6 valid_binding_accepted: ' || v_case || ']';

  -- 7. Historical rows were neither rewritten nor given provenance by the migration.
  SELECT count(*) INTO v_after FROM public.cos_university_exam_runs
    WHERE execution_provenance IS NULL AND id <> v_id;
  v_report := v_report || ' [7 history_untouched: ' ||
    CASE WHEN v_after = v_before + 1 THEN 'PASS rows=' || v_before::text
         ELSE 'FAIL before=' || v_before::text || ' unbound_now=' || v_after::text END || ']';

  RAISE EXCEPTION 'UNIVERSITY BINDING PROOF (all writes rolled back):%', v_report;
END
$proof$
