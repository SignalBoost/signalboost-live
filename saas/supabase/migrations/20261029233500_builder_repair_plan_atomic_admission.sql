-- Set the initial repair plan version within canonical Builder admission transaction.
-- The existing enqueue_builder_job RPC inserts the job and History together.
-- Replanned repository execution is version 2 from first visibility; no queued
-- window exists in which the worker can claim version 1.
create or replace function public.initialize_builder_repair_plan_version()
returns trigger language plpgsql set search_path=public,pg_temp as $plan$
begin
  if new.job_kind = 'standard' and new.metadata->>'platformRepair' = 'true'
     and new.metadata ? 'repairExecutionObjective' then
    if nullif(btrim(new.metadata->>'repairExecutionObjective'), '') is null
       or new.metadata->>'repairPlanVersion' is distinct from '2' then
      raise exception 'builder_repair_plan_invalid_admission' using errcode='22023';
    end if;
    new.plan_version := 2;
  end if;
  return new;
end;
$plan$;
drop trigger if exists initialize_builder_repair_plan_version on public.builder_jobs;
create trigger initialize_builder_repair_plan_version
before insert on public.builder_jobs
for each row execute function public.initialize_builder_repair_plan_version();
