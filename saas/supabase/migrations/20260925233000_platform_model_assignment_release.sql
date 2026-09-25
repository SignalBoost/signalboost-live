-- saas/supabase/migrations/20260925233000_platform_model_assignment_release.sql
-- Return a role to ordinary platform routing without activating another model.
-- Before this, a role's FIRST durable assignment could never be undone: rollback needs a previous
-- assignment and disable refuses a model that is actively assigned. Release marks the active row
-- 'released'; currentAssignment() then finds nothing active and existing routing stays authoritative.
do $$
declare v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'public.platform_model_assignments'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%rolled_back%'
  loop
    execute format('alter table public.platform_model_assignments drop constraint %I', v_name);
  end loop;
end $$;

alter table public.platform_model_assignments
  add constraint platform_model_assignments_status_check
  check (status in ('active','superseded','rolled_back','released'));

create or replace function public.platform_release_model_assignment(
  p_use text,
  p_actor text,
  p_expected_current_assignment_id uuid
) returns public.platform_model_assignments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current public.platform_model_assignments%rowtype;
begin
  if p_use not in ('cos_reasoner','builder','specialist') then raise exception 'platform_model_assignment_use_invalid'; end if;
  if trim(coalesce(p_actor,''))='' then raise exception 'platform_model_actor_required'; end if;
  select * into v_current from public.platform_model_assignments
    where use=p_use and status='active' for update;
  if v_current.assignment_id is null then raise exception 'platform_model_assignment_no_active_assignment'; end if;
  if v_current.assignment_id <> p_expected_current_assignment_id then raise exception 'platform_model_assignment_conflict'; end if;
  update public.platform_model_assignments set status='released'
    where assignment_id=v_current.assignment_id
    returning * into v_current;
  return v_current;
end $$;

revoke all on function public.platform_release_model_assignment(text,text,uuid) from public, anon, authenticated;
grant execute on function public.platform_release_model_assignment(text,text,uuid) to service_role;