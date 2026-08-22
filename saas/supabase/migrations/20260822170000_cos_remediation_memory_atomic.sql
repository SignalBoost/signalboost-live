-- Atomically records a verified outcome. It never authorizes or executes a remedy.
create or replace function public.cos_record_remediation_memory(
  p_incident_key text,
  p_remedy_id text,
  p_succeeded boolean
)
returns setof public.cos_remediation_memory
language sql
security invoker
set search_path = public
as $$
  insert into public.cos_remediation_memory (
    incident_key,
    remedy_id,
    verified_successes,
    verified_failures,
    consecutive_failures,
    recommendation_eligible,
    updated_at
  ) values (
    p_incident_key,
    p_remedy_id,
    case when p_succeeded then 1 else 0 end,
    case when p_succeeded then 0 else 1 end,
    case when p_succeeded then 0 else 1 end,
    p_succeeded,
    now()
  )
  on conflict (incident_key, remedy_id) do update set
    verified_successes = public.cos_remediation_memory.verified_successes + case when p_succeeded then 1 else 0 end,
    verified_failures = public.cos_remediation_memory.verified_failures + case when p_succeeded then 0 else 1 end,
    consecutive_failures = case when p_succeeded then 0 else public.cos_remediation_memory.consecutive_failures + 1 end,
    recommendation_eligible = case
      when p_succeeded then public.cos_remediation_memory.verified_successes + 1 >= 3
      else false
    end,
    updated_at = now()
  returning *;
$$;

revoke all on function public.cos_record_remediation_memory(text, text, boolean) from public, anon, authenticated;
grant execute on function public.cos_record_remediation_memory(text, text, boolean) to service_role;
comment on function public.cos_record_remediation_memory(text, text, boolean) is
  'Service-role-only atomic verified outcome recorder for COS remediation recommendation evidence; never authorizes execution.';
