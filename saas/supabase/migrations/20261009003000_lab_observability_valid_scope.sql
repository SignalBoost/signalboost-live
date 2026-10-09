-- A configured scope must correspond to a real organization with a real active owner.
create or replace function public.itmounts_lab_observability_scope_valid(p_tenant_id text)
returns boolean language sql security definer set search_path=pg_catalog,lab as $$
 select exists (
  select 1 from lab.organizations o join lab.organization_members m
    on m.organization_id=o.id
  where o.id::text=p_tenant_id and m.role='owner' and m.status='active'
 )
$$;
revoke all on function public.itmounts_lab_observability_scope_valid(text) from public,anon,authenticated;
grant execute on function public.itmounts_lab_observability_scope_valid(text) to service_role;
