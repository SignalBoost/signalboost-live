-- Lab ownership bridge; does not enable billing.
create table lab.university_run_bindings (
 run_id uuid primary key references public.cos_university_mass_distillation_batch_runs(id) on delete restrict,
 organization_id uuid not null,
 experiment_id uuid not null,
 created_at timestamptz not null default now(),
 foreign key (experiment_id,organization_id) references lab.experiments(id,organization_id)
);
alter table lab.university_run_bindings enable row level security;
revoke all on lab.university_run_bindings from public,anon,authenticated,service_role;

create index university_run_bindings_experiment_idx on lab.university_run_bindings(experiment_id);
create function lab.bind_university_run(p_run_id uuid,p_organization_id uuid,p_experiment_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,lab as $$
declare existing lab.university_run_bindings%rowtype;
begin
 if session_user not in ('postgres','service_role') or
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
