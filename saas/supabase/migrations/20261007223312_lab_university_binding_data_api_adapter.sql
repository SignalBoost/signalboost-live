-- Minimal Data API adapter. Public-schema wrappers are SECURITY INVOKER and executable only by service_role.
-- Privileged reads/writes remain in the private lab schema.
create or replace function lab.get_experiment_execution_contract(p_organization_id uuid,p_experiment_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,lab as $$
declare e lab.experiments%rowtype;
declare jwt_role text := coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','');
begin
 if session_user not in ('postgres','service_role') and jwt_role <> 'service_role' then raise exception 'lab_service_authority_denied'; end if;
 select * into e from lab.experiments where id=p_experiment_id and organization_id=p_organization_id;
 if not found then return null; end if;
 return jsonb_build_object('id',e.id,'organization_id',e.organization_id,'privacy_tier',e.privacy_tier,'budget_microcredits',e.budget_microcredits);
end $$;
revoke all on function lab.get_experiment_execution_contract(uuid,uuid) from public,anon,authenticated;
grant execute on function lab.get_experiment_execution_contract(uuid,uuid) to service_role;

create or replace function lab.get_university_run_execution_contract(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,lab,public as $$
declare jwt_role text := coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','');
declare exists_run boolean;
begin
 if session_user not in ('postgres','service_role') and jwt_role <> 'service_role' then raise exception 'lab_service_authority_denied'; end if;
 select exists(select 1 from public.cos_university_mass_distillation_batch_runs where id=p_run_id) into exists_run;
 if not exists_run then return null; end if;
 return jsonb_build_object('id',p_run_id,'authority_expanded',false);
end $$;
revoke all on function lab.get_university_run_execution_contract(uuid) from public,anon,authenticated;
grant execute on function lab.get_university_run_execution_contract(uuid) to service_role;

create or replace function public.itmounts_lab_experiment_execution_contract(p_organization_id uuid,p_experiment_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,lab as $$
 select lab.get_experiment_execution_contract(p_organization_id,p_experiment_id)
$$;
revoke all on function public.itmounts_lab_experiment_execution_contract(uuid,uuid) from public,anon,authenticated;
grant execute on function public.itmounts_lab_experiment_execution_contract(uuid,uuid) to service_role;

create or replace function public.itmounts_lab_university_run_execution_contract(p_run_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog,lab as $$
 select lab.get_university_run_execution_contract(p_run_id)
$$;
revoke all on function public.itmounts_lab_university_run_execution_contract(uuid) from public,anon,authenticated;
grant execute on function public.itmounts_lab_university_run_execution_contract(uuid) to service_role;

create or replace function public.itmounts_lab_bind_university_run(p_run_id uuid,p_organization_id uuid,p_experiment_id uuid)
returns void language plpgsql security invoker set search_path=pg_catalog,lab as $$
begin
 if coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','') <> 'service_role'
    and session_user not in ('postgres','service_role') then
   raise exception 'lab_service_authority_denied';
 end if;
 perform lab.bind_university_run_trusted(p_run_id,p_organization_id,p_experiment_id);
end $$;
revoke all on function public.itmounts_lab_bind_university_run(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.itmounts_lab_bind_university_run(uuid,uuid,uuid) to service_role;
