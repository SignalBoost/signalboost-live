-- Make PhD research product persistence and run completion one transaction.
-- The function is SECURITY INVOKER and executable only by service_role; browser roles remain blocked.

create or replace function public.cos_university_phd_submit_work_product(
  p_assignment_key text,
  p_product_key text,
  p_actor_id text,
  p_content_text text,
  p_content_hash text,
  p_source_ref text,
  p_submitted_at timestamptz,
  p_turn_id text,
  p_response_source text,
  p_local_model_invoked boolean,
  p_external_ai_invoked boolean,
  p_semantic_cache boolean
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_performer_actor_id text;
  v_assigned_at timestamptz;
  v_not_after timestamptz;
  v_run_status text;
  v_existing_actor_id text;
  v_existing_content_hash text;
  v_existing_product_key text;
begin
  if nullif(btrim(coalesce(p_assignment_key, '')), '') is null
     or nullif(btrim(coalesce(p_product_key, '')), '') is null
     or nullif(btrim(coalesce(p_actor_id, '')), '') is null
     or nullif(btrim(coalesce(p_content_text, '')), '') is null
     or nullif(btrim(coalesce(p_content_hash, '')), '') is null
     or nullif(btrim(coalesce(p_source_ref, '')), '') is null
     or nullif(btrim(coalesce(p_turn_id, '')), '') is null
     or p_submitted_at is null
     or p_local_model_invoked is distinct from true
     or p_external_ai_invoked is distinct from false
     or p_semantic_cache is distinct from false then
    return false;
  end if;

  select performer_actor_id, assigned_at, not_after
    into v_performer_actor_id, v_assigned_at, v_not_after
  from public.cos_university_phd_work_assignments
  where assignment_key = p_assignment_key;

  if not found
     or v_performer_actor_id <> p_actor_id
     or p_submitted_at < v_assigned_at
     or p_submitted_at > v_not_after then
    return false;
  end if;

  select status into v_run_status
  from public.cos_university_phd_work_runs
  where assignment_key = p_assignment_key
  for update;

  if not found or v_run_status not in ('running', 'submitted') then
    return false;
  end if;

  select actor_id, content_hash, product_key
    into v_existing_actor_id, v_existing_content_hash, v_existing_product_key
  from public.cos_university_phd_work_products
  where assignment_key = p_assignment_key;

  if found then
    if v_existing_actor_id <> p_actor_id
       or v_existing_content_hash <> p_content_hash
       or v_existing_product_key <> p_product_key then
      return false;
    end if;
  else
    insert into public.cos_university_phd_work_products (
      product_key, assignment_key, actor_id, content_text, content_hash,
      source_ref, submitted_at, academic_credit
    ) values (
      p_product_key, p_assignment_key, p_actor_id, p_content_text, p_content_hash,
      p_source_ref, p_submitted_at, false
    );
  end if;

  update public.cos_university_phd_work_runs
  set status = 'submitted',
      completed_at = p_submitted_at,
      claim_expires_at = null,
      turn_id = p_turn_id,
      response_source = p_response_source,
      local_model_invoked = p_local_model_invoked,
      external_ai_invoked = p_external_ai_invoked,
      semantic_cache = p_semantic_cache,
      updated_at = p_submitted_at
  where assignment_key = p_assignment_key;

  return true;
end;
$$;

revoke all on function public.cos_university_phd_submit_work_product(
  text,text,text,text,text,text,timestamptz,text,text,boolean,boolean,boolean
) from public;
revoke all on function public.cos_university_phd_submit_work_product(
  text,text,text,text,text,text,timestamptz,text,text,boolean,boolean,boolean
) from anon, authenticated;
grant execute on function public.cos_university_phd_submit_work_product(
  text,text,text,text,text,text,timestamptz,text,text,boolean,boolean,boolean
) to service_role;

-- Reconcile any product written by the pre-transaction worker before its run-state update.
-- The product remains academic_credit=false; this only restores operational consistency.
update public.cos_university_phd_work_runs r
set status = 'submitted',
    completed_at = coalesce(r.completed_at, p.submitted_at),
    claim_expires_at = null,
    updated_at = greatest(r.updated_at, p.submitted_at)
from public.cos_university_phd_work_products p
where r.assignment_key = p.assignment_key
  and r.status = 'running';
