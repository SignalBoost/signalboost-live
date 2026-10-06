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
