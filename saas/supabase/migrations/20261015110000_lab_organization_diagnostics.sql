-- Organization-scoped diagnostics from existing customer training runs.
-- NO operator cross-tenant access, no model names, prompts, job URLs or raw exceptions.
create or replace function public.itmounts_lab_customer_run_diagnostics(p_organization_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
 if coalesce(lab.customer_member_role(uid,p_organization_id),'') not in ('owner','admin') then
   raise exception 'lab_customer_training_forbidden';
 end if;
 return jsonb_build_object(
  'windowDays',30,
  'totalRuns',(select count(*) from lab.customer_training_runs where organization_id=p_organization_id and created_at>=now()-interval '30 days'),
  'stages',coalesce((select jsonb_agg(jsonb_build_object('stage',stage,'count',n) order by stage)
   from (select stage,count(*) as n from lab.customer_training_runs
         where organization_id=p_organization_id and created_at>=now()-interval '30 days'
         group by stage) x),'[]'::jsonb),
  'failures',coalesce((select jsonb_agg(jsonb_build_object('category',category,'count',n) order by n desc)
   from (select case
      when failure_code ~ '^(lab_)?(credential|auth|permission|token)' then 'credentials'
      when failure_code ~ '^(lab_)?(dataset|prompt|examples|model)' then 'data'
      when failure_code ~ '^(lab_)?(provider|together|fireworks|huggingface)' then 'provider'
      when failure_code ~ '^(lab_)?(job|submission|reserved)' then 'uncertain'
      else 'other' end as category,count(*) as n
    from lab.customer_training_runs
    where organization_id=p_organization_id and created_at>=now()-interval '30 days' and stage='failed'
    group by 1) f),'[]'::jsonb)
 );
end $$;
revoke all on function public.itmounts_lab_customer_run_diagnostics(uuid) from public,anon,service_role;
grant execute on function public.itmounts_lab_customer_run_diagnostics(uuid) to authenticated;
notify pgrst,'reload schema';
