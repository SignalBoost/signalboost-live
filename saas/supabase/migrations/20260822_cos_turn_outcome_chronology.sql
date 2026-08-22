-- Chronological outcome merge repair.
-- The #1328 row merge accepted out-of-order events. New writes use this function so older evidence
-- cannot replace a newer verified outcome, while the legacy function remains for migration compatibility.

create or replace function public.cos_merge_turn_outcome_chronological(
  p_turn_id uuid,
  p_repair_needed boolean default null,
  p_escalated boolean default null,
  p_user_feedback text default null,
  p_verified_success boolean default null,
  p_outcome_source text default 'unknown',
  p_outcome_at timestamptz default now()
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  applied boolean := false;
begin
  insert into public.cos_turn_outcomes (turn_id, repair_needed, escalated, user_feedback, verified_success, outcome_at, outcome_source, updated_at)
  values (
    p_turn_id, p_repair_needed, p_escalated, left(nullif(trim(p_user_feedback), ''), 400),
    p_verified_success, coalesce(p_outcome_at, now()),
    left(coalesce(nullif(trim(p_outcome_source), ''), 'unknown'), 120), now()
  )
  on conflict (turn_id) do update set
    repair_needed = coalesce(excluded.repair_needed, cos_turn_outcomes.repair_needed),
    escalated = coalesce(excluded.escalated, cos_turn_outcomes.escalated),
    user_feedback = coalesce(excluded.user_feedback, cos_turn_outcomes.user_feedback),
    verified_success = coalesce(excluded.verified_success, cos_turn_outcomes.verified_success),
    outcome_at = excluded.outcome_at,
    outcome_source = excluded.outcome_source,
    updated_at = now()
  where excluded.outcome_at >= cos_turn_outcomes.outcome_at
  returning true into applied;

  return applied;
end;
$$;

revoke all on function public.cos_merge_turn_outcome_chronological(uuid, boolean, boolean, text, boolean, text, timestamptz) from public;
grant execute on function public.cos_merge_turn_outcome_chronological(uuid, boolean, boolean, text, boolean, text, timestamptz) to service_role;

comment on function public.cos_merge_turn_outcome_chronological(uuid, boolean, boolean, text, boolean, text, timestamptz) is
  'Chronological turn outcome merge: older deliveries are ignored and cannot regress verified outcome state.';
