-- Phase 3: isolated membership resolution proof. Disposable Postgres ONLY.
-- Run after Lab hierarchy + lab_customer_tenant_membership migration. All fixtures rollback.
BEGIN;
DO $phase3_members$
DECLARE
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  owner_a uuid := gen_random_uuid(); member_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid(); removed_a uuid := gen_random_uuid();
  response jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES (owner_a),(member_a),(owner_b),(removed_a);
  INSERT INTO lab.organizations(id,name) VALUES (a,'phase3-member-A'),(b,'phase3-member-B');
  INSERT INTO lab.organization_members(organization_id,user_id,role,status) VALUES
    (a,owner_a,'owner','active'),
    (a,member_a,'member','active'),
    (b,owner_b,'owner','active'),
    (a,removed_a,'admin','removed');

  response := lab.resolve_user_organization(owner_a,a);
  IF response->>'role' IS DISTINCT FROM 'owner' OR response->>'status' IS DISTINCT FROM 'active'
     OR response->>'organization_id' IS DISTINCT FROM a::text THEN
    RAISE EXCEPTION 'FAIL: A owner does not resolve within A';
  END IF;
  response := lab.resolve_user_organization(member_a,a);
  IF response->>'role' IS DISTINCT FROM 'member' THEN
    RAISE EXCEPTION 'FAIL: A membership role escalated';
  END IF;
  IF lab.resolve_user_organization(owner_a,b) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: A owner acquired B membership';
  END IF;
  IF lab.resolve_user_organization(owner_b,a) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: B owner acquired A membership';
  END IF;
  IF lab.resolve_user_organization(removed_a,a) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: removed admin remained active';
  END IF;
  IF has_table_privilege('anon','lab.organization_members','SELECT') OR
     has_table_privilege('authenticated','lab.organization_members','SELECT') THEN
    RAISE EXCEPTION 'FAIL: membership table exposed to client roles';
  END IF;
  IF has_function_privilege('anon','public.itmounts_lab_resolve_user_organization(uuid,uuid)','EXECUTE') OR
     has_function_privilege('authenticated','public.itmounts_lab_resolve_user_organization(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: membership resolver exposed to client roles';
  END IF;
  RAISE NOTICE 'PASS: owners remain organization-scoped; members cannot escalate; removed admins excluded; resolver and membership table client-denied';
END $phase3_members$;
ROLLBACK;
