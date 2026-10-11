-- Service-only atomic first Lab organization provisioning.
-- The trusted caller must have already verified the platform owner session.
create or replace function public.itmounts_lab_provision_owner_organization(
  p_owner_user_id uuid,
  p_organization_name text
) returns uuid
language plpgsql security definer set search_path = pg_catalog,lab as $$
declare jwt_role text := coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role';
declare existing_id uuid;
declare new_id uuid;
begin
 if (session_user not in ('postgres','service_role') and coalesce(jwt_role,'') <> 'service_role') or
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


-- Customer onboarding is one atomic, idempotent transaction. No credits or paid work are authorized.
create or replace function public.itmounts_lab_customer_initialize_workspace(p_name text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,lab as $$
declare uid uuid := auth.uid();
declare jwt_role text := coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role';
declare org uuid; uni uuid; project uuid; experiment uuid; org_name text; project_name text;
begin
 if uid is null or jwt_role is distinct from 'authenticated' then raise exception 'lab_customer_session_required'; end if;
 if nullif(btrim(p_name),'') is null or length(btrim(p_name))>120 then raise exception 'lab_customer_workspace_name_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,916235));
 select m.organization_id,o.name into org,org_name from lab.organization_members m
 join lab.organizations o on o.id=m.organization_id
 where m.user_id=uid and m.role='owner' and m.status='active' order by m.created_at limit 1;
 if org is null then
  insert into lab.organizations(name) values(btrim(p_name)) returning id,name into org,org_name;
  insert into lab.organization_members(organization_id,user_id,role,status) values(org,uid,'owner','active');
  insert into lab.credit_accounts(organization_id) values(org);
 end if;
 select e.id,p.id,p.name into experiment,project,project_name from lab.experiments e
 join lab.projects p on p.id=e.project_id and p.organization_id=e.organization_id
 where e.organization_id=org and e.privacy_tier='PRIVATE' order by e.id limit 1;
 if experiment is null then
  select id into uni from lab.universities where organization_id=org order by id limit 1;
  if uni is null then insert into lab.universities(organization_id,name) values(org,btrim(p_name)) returning id into uni; end if;
  insert into lab.projects(organization_id,university_id,name) values(org,uni,btrim(p_name)) returning id,name into project,project_name;
  insert into lab.experiments(organization_id,project_id,privacy_tier,budget_microcredits) values(org,project,'PRIVATE',0) returning id into experiment;
 end if;
 return jsonb_build_object('organizationId',org,'organizationName',org_name,'experimentId',experiment,'projectName',project_name,'role','owner');
end $$;
revoke all on function public.itmounts_lab_customer_initialize_workspace(text) from public,anon,service_role;
grant execute on function public.itmounts_lab_customer_initialize_workspace(text) to authenticated;
