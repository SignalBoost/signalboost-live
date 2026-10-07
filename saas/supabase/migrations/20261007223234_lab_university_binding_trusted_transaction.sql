-- Service-role transaction bridge for the private Lab -> University ownership binding.
-- Tenant context is transaction-local and is never accepted from a public customer request.
create or replace function lab.bind_university_run(p_run_id uuid,p_organization_id uuid,p_experiment_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,lab as $$
declare existing lab.university_run_bindings%rowtype;
declare jwt_role text := coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','');
begin
 if (session_user not in ('postgres','service_role') and jwt_role <> 'service_role') or
 current_setting('lab.trusted_organization_id',true) is distinct from p_organization_id::text then
 raise exception 'lab_tenant_authority_denied'; end if;
 if p_run_id is null or p_experiment_id is null then raise exception 'lab_binding_invalid'; end if;
 perform 1 from lab.experiments where id=p_experiment_id and organization_id=p_organization_id;
 if not found then raise exception 'lab_experiment_missing'; end if;
 perform 1 from public.cos_university_mass_distillation_batch_runs where id=p_run_id;
 if not found then raise exception 'lab_university_run_missing'; end if;
 insert into lab.university_run_bindings(run_id,organization_id,experiment_id)
 values(p_run_id,p_organization_id,p_experiment_id) on conflict(run_id) do nothing;
 select * into existing from lab.university_run_bindings where run_id=p_run_id;
 if existing.organization_id is distinct from p_organization_id or existing.experiment_id is distinct from p_experiment_id then
 raise exception 'lab_university_run_binding_conflict'; end if;
end $$;
revoke all on function lab.bind_university_run(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function lab.bind_university_run(uuid,uuid,uuid) to service_role;

create or replace function lab.bind_university_run_trusted(p_run_id uuid,p_organization_id uuid,p_experiment_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,lab as $$
declare jwt_role text := coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','');
begin
 if session_user not in ('postgres','service_role') and jwt_role <> 'service_role' then
   raise exception 'lab_service_authority_denied';
 end if;
 perform set_config('lab.trusted_organization_id',p_organization_id::text,true);
 perform lab.bind_university_run(p_run_id,p_organization_id,p_experiment_id);
end $$;
revoke all on function lab.bind_university_run_trusted(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function lab.bind_university_run_trusted(uuid,uuid,uuid) to service_role;
