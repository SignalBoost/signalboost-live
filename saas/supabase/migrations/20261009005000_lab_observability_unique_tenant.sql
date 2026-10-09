-- Resolve monitoring only when exactly one genuine Lab organization has an active owner.
-- Multiple organizations require an explicit trusted deployment scope; never choose arbitrarily.
create or replace function public.itmounts_lab_observability_unique_tenant()
returns text language sql security definer set search_path=pg_catalog,lab as $$
 with eligible as (
   select distinct o.id from lab.organizations o
   join lab.organization_members m on m.organization_id=o.id
   where m.role='owner' and m.status='active'
 )
 select case when count(*)=1 then min(id)::text else null end from eligible
$$;
revoke all on function public.itmounts_lab_observability_unique_tenant() from public,anon,authenticated;
grant execute on function public.itmounts_lab_observability_unique_tenant() to service_role;
