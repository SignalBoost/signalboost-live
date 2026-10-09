-- Phase 3 acceptance: database access-control surface, read-only and safe on a live instance.
-- Only a *partial* gate: does not prove customer compute, storage, logs, exports, or rollback.
-- Execute using psql -v ON_ERROR_STOP=1 -f saas/tests/sql/lab-phase3-access-boundary-acceptance.sql
DO $phase3$
DECLARE
  t record;
  f record;
  checked_tables integer := 0;
  checked_functions integer := 0;
BEGIN
  FOR t IN
    SELECT c.oid, c.relname, c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='lab' AND c.relkind IN ('r','p')
  LOOP
    checked_tables := checked_tables+1;
    IF NOT t.relrowsecurity THEN
      RAISE EXCEPTION 'FAIL phase3: lab.% has no RLS',t.relname;
    END IF;
    IF has_table_privilege('anon',t.oid,'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       OR has_table_privilege('authenticated',t.oid,'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
      RAISE EXCEPTION 'FAIL phase3: lab.% reachable by public client roles',t.relname;
    END IF;
  END LOOP;
  IF checked_tables < 11 THEN
    RAISE EXCEPTION 'FAIL phase3: expected Lab hierarchy and binding tables, found %',checked_tables;
  END IF;
  IF has_schema_privilege('anon','lab','USAGE') OR has_schema_privilege('authenticated','lab','USAGE') THEN
    RAISE EXCEPTION 'FAIL phase3: lab schema exposed to client roles';
  END IF;
  -- The sole exempt Lab function has PostgreSQL's trigger-only return type.
  -- It must never be converted into a privileged callable RPC.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='lab' AND p.proname='prevent_credit_event_mutation'
       AND p.prorettype='pg_catalog.trigger'::regtype AND p.prosecdef=false
       AND p.prokind='f'
  ) THEN
    RAISE EXCEPTION 'FAIL phase3: credit-event trigger exception is missing or privileged';
  END IF;
  FOR f IN
    SELECT p.oid,p.proname,n.nspname
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE (n.nspname='public' AND p.proname LIKE 'itmounts_lab_%')
        OR (n.nspname='lab' AND p.prokind='f' AND p.proname <> 'prevent_credit_event_mutation')
  LOOP
    checked_functions := checked_functions+1;
    IF has_function_privilege('anon',f.oid,'EXECUTE')
       OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL phase3: callable %.% exposed to client roles',f.nspname,f.proname;
    END IF;
  END LOOP;
  IF checked_functions < 8 THEN
    RAISE EXCEPTION 'FAIL phase3: required Lab RPC boundary missing, found %',checked_functions;
  END IF;
  RAISE NOTICE 'PASS phase3 database permission surface: % RLS tables, % protected functions; storage, exports, logs, telemetry, credentials and BYOI remain unverified',checked_tables,checked_functions;
END $phase3$;
