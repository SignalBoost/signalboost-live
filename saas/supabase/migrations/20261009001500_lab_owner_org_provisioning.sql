-- Service-only atomic first Lab organization provisioning.
-- The trusted caller must have already verified the platform owner session.
create or replace function public.itmounts_lab_provision_owner_organization(
  p_owner_user_id uuid,
  p_organization_name text
) returns uuid
language plpgsql security definer set search_path = pg_catalog,lab as $$
declare existing_id uuid;
declare new_id uuid;
begin
 if session_user not in ('postgres','service_role') or
    nullif(btrim(p_organization_name),'') is null or
    length(btrim(p_organization_name)) > 120 then
   raise exception 'lab_owner_provisioning_denied';
 end if;
 if not exists(select 1 from auth.users where id=p_owner_user_id) then
   raise exception 'lab_verified_owner_missing';
 end if;
 -- Serialize concurrent first-provisioning requests for this identity.
 perform pg_advisory_xact_lock(hashtextextended(p_owner_user_id::text, 916235));
 select organization_id into existing_id from lab.organization_members
   where user_id=p_owner_user_id and role='owner' and status='active'
   order by created_at limit 1;
 if existing_id is not null then return existing_id; end if;
 insert into lab.organizations(name) values(btrim(p_organization_name)) returning id into new_id;
 insert into lab.organization_members(organization_id,user_id,role,status)
   values(new_id,p_owner_user_id,'owner','active');
 insert into lab.credit_accounts(organization_id,funded_microcredits,reserved_microcredits,captured_microcredits,refunded_microcredits)
   values(new_id,0,0,0,0);
 return new_id;
end $$;
revoke all on function public.itmounts_lab_provision_owner_organization(uuid,text) from public,anon,authenticated;
grant execute on function public.itmounts_lab_provision_owner_organization(uuid,text) to service_role;
