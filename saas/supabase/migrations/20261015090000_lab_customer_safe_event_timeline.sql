-- Customer LAB: read an existing durable, append-only training run event trail.
-- Deliberately exclude the legacy `detail` JSON: some prior events include identifiers.
-- Role membership and run ownership checked inside SECURITY DEFINER RPC.
create or replace function public.itmounts_lab_customer_safe_training_events(
 p_organization_id uuid, p_run_id uuid
) returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
 if lab.customer_member_role(uid, p_organization_id) is null then
  raise exception 'lab_customer_training_forbidden';
 end if;
 perform 1 from lab.customer_training_runs
  where id = p_run_id and organization_id = p_organization_id;
 if not found then raise exception 'lab_customer_run_not_found'; end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
    'sequence', e.id,
    'event', case when e.event in (
      'credentials_released','run_created','stage_changed','job_submitted',
      'job_not_created','job_reserved','job_completed','job_failed',
      'job_cancelled','job_recovered','artifact_ready'
    ) then e.event else 'other' end,
    'actor', e.actor,
    'recordedAt', e.created_at
  ) order by e.id)
  from (
   select id,event,actor,created_at from lab.customer_training_events
   where organization_id = p_organization_id and run_id = p_run_id
   order by id desc limit 100
  ) e
 ),'[]'::jsonb);
end $$;
revoke all on function public.itmounts_lab_customer_safe_training_events(uuid,uuid) from public,anon,service_role;
grant execute on function public.itmounts_lab_customer_safe_training_events(uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
