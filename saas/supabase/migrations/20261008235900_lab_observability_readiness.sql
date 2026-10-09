-- Aggregate-only owner readiness, accessible exclusively through service-role backend.
-- Safe to expose a count through internal owner API, never organization identifiers.
create or replace function public.itmounts_lab_observability_owner_organization_count()
returns bigint language sql security definer set search_path=pg_catalog,lab as $$
 select count(*)::bigint from lab.organizations
$$;
revoke all on function public.itmounts_lab_observability_owner_organization_count() from public,anon,authenticated;
grant execute on function public.itmounts_lab_observability_owner_organization_count() to service_role;
