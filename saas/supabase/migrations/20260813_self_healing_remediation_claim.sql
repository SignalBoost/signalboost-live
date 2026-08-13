-- Atomically claim one unattended repair attempt for a stable recovery key.
-- The primary key on recovery_key plus the WHERE clause prevents overlapping
-- monitoring cycles from retrying the same failed resource more than once.
create or replace function public.claim_self_healing_remediation_attempt(
  p_recovery_key text,
  p_incident_id text,
  p_provider text,
  p_environment text,
  p_error_code text default null,
  p_affected_resource text default null,
  p_details jsonb default '{}'::jsonb
)
returns public.self_healing_remediation_verifications
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.self_healing_remediation_verifications;
begin
  insert into public.self_healing_remediation_verifications (
    recovery_key,
    incident_id,
    provider,
    environment,
    error_code,
    affected_resource,
    repair_outcome,
    verification_status,
    automatic_attempts,
    first_attempted_at,
    last_attempted_at,
    details,
    updated_at
  ) values (
    p_recovery_key,
    p_incident_id,
    p_provider,
    p_environment,
    p_error_code,
    p_affected_resource,
    'executed',
    'pending',
    1,
    now(),
    now(),
    coalesce(p_details, '{}'::jsonb),
    now()
  )
  on conflict (recovery_key) do update
    set incident_id = excluded.incident_id,
        last_attempted_at = now(),
        updated_at = now(),
        details = public.self_healing_remediation_verifications.details || excluded.details
    where public.self_healing_remediation_verifications.automatic_attempts < 1
      and public.self_healing_remediation_verifications.verification_status <> 'verified'
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_self_healing_remediation_attempt(text,text,text,text,text,text,jsonb) from public;
revoke all on function public.claim_self_healing_remediation_attempt(text,text,text,text,text,text,jsonb) from anon;
revoke all on function public.claim_self_healing_remediation_attempt(text,text,text,text,text,text,jsonb) from authenticated;
grant execute on function public.claim_self_healing_remediation_attempt(text,text,text,text,text,text,jsonb) to service_role;
