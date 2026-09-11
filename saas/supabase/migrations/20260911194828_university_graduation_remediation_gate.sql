-- Read the canonical pending-remediation predicate in one snapshot. The count covers every
-- matching plan; only diagnostic IDs are bounded. Legacy undergraduate plans have null program keys.
CREATE OR REPLACE FUNCTION public.read_cos_university_undergraduate_remediation(
  p_agent_id text, p_program_key text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE result jsonb;
BEGIN
  IF p_agent_id IS NULL OR pg_catalog.btrim(p_agent_id) = '' OR pg_catalog.btrim(p_agent_id) <> p_agent_id
    OR p_program_key IS DISTINCT FROM 'generalist_undergraduate_v1' THEN
    RAISE EXCEPTION 'invalid_graduation_remediation_scope' USING ERRCODE = '22023';
  END IF;
  WITH pending AS MATERIALIZED (
    SELECT p.id, p.source_kind, p.status
    FROM public.cos_university_study_plans p
    WHERE p.agent_id = p_agent_id
      AND (p.academic_level = 'undergraduate' OR p.academic_level IS NULL)
      AND (p.program_key IS NULL OR p.program_key = p_program_key)
      AND p.source_kind IN ('failure_autopsy', 'operational_weakness', 'recertification')
      AND (p.status NOT IN ('completed', 'superseded') OR p.status IS NULL)
  )
  SELECT pg_catalog.jsonb_build_object(
    'agentId', p_agent_id, 'programKey', p_program_key,
    'pendingCount', (SELECT count(*) FROM pending),
    'blockers', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'planId', sample.id, 'sourceKind', sample.source_kind, 'status', sample.status
    ) ORDER BY sample.id) FROM (SELECT * FROM pending ORDER BY id LIMIT 25) sample), '[]'::jsonb),
    'checkedAt', pg_catalog.clock_timestamp(),
    'semantics', 'agent_scoped_pending_undergraduate_remediation_v1'
  ) INTO result;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.read_cos_university_undergraduate_remediation(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_cos_university_undergraduate_remediation(text, text) TO service_role;

-- Every plan mutation and credential insertion uses the same transaction lock. Moving a plan
-- between identities takes both locks in numeric order. No plan state or academic evidence is changed.
CREATE OR REPLACE FUNCTION public.cos_university_remediation_write_fence()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  old_agent text;
  new_agent text;
  lock_key bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_agent := OLD.agent_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_agent := NEW.agent_id; END IF;
  FOR lock_key IN
    SELECT DISTINCT pg_catalog.hashtextextended('cos-university-credential:' || identity.agent_id, 0)
    FROM pg_catalog.unnest(ARRAY[old_agent, new_agent]) AS identity(agent_id)
    WHERE identity.agent_id IS NOT NULL
    ORDER BY 1
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(lock_key);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.cos_university_remediation_write_fence() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cos_university_credential_remediation_guard()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE remediation jsonb;
BEGIN
  IF NEW.program_level IS DISTINCT FROM 'undergraduate' THEN RETURN NEW; END IF;
  -- A transaction-wide old snapshot must not miss a remediation committed while waiting for the
  -- lock. PostgREST uses READ COMMITTED; fail closed for callers with a different isolation mode.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'graduation_requires_read_committed' USING ERRCODE = '25000';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cos-university-credential:' || NEW.agent_id, 0)
  );
  -- Preserve exact-key retry semantics. The existing UNIQUE constraint rejects this duplicate,
  -- and the host can read the immutable historical credential even after later remediation.
  IF EXISTS (SELECT 1 FROM public.cos_university_credentials c
    WHERE c.credential_key = NEW.credential_key AND c.agent_id = NEW.agent_id
      AND c.program_key = NEW.program_key AND c.program_level = NEW.program_level) THEN
    RETURN NEW;
  END IF;
  remediation := public.read_cos_university_undergraduate_remediation(NEW.agent_id, NEW.program_key);
  IF (remediation ->> 'pendingCount')::bigint > 0 THEN
    RAISE EXCEPTION 'unresolved_undergraduate_remediation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.cos_university_credential_remediation_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cos_university_remediation_write_fence ON public.cos_university_study_plans;
CREATE TRIGGER cos_university_remediation_write_fence
BEFORE INSERT OR UPDATE OR DELETE ON public.cos_university_study_plans
FOR EACH ROW EXECUTE FUNCTION public.cos_university_remediation_write_fence();

DROP TRIGGER IF EXISTS cos_university_credential_remediation_guard ON public.cos_university_credentials;
CREATE TRIGGER cos_university_credential_remediation_guard
BEFORE INSERT ON public.cos_university_credentials
FOR EACH ROW EXECUTE FUNCTION public.cos_university_credential_remediation_guard();

-- Keep existing credential immutability and table/RLS grants unchanged. This is an additional veto,
-- not a substitute for independent assessments, residence, capstone, or execution-identity gates.
