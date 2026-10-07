-- saas/supabase/migrations/20261007010000_mass_evaluation_claim_35_holdout_12.sql
-- Owner decision 2026-10-07: holdout 6 -> 12 cases, evaluator call ceiling 25 -> 35 (MASS_EVALUATION_ENDPOINT_CALLS).
-- Apply BEFORE the TypeScript deploys. Accepts BOTH 25 and 35, so it is safe with the old and the new code.
-- Edits the LIVE claim in place (like 20260929024000 and 20261003153000); only the ceiling test changes.
-- Unchanged: <= $0.20 wake cost, one wake, 4 judge calls, retention wait, all gates. Re-running is safe.
do $migration$
declare
  v_definition text;
  v_occurrences integer;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_evaluation' and p.pronargs = 0;
  if v_definition is null then
    raise exception 'claim_next_mass_distilled_evaluation() not found';
  end if;
  if position('v_max_endpoint not in (25,35)' in v_definition) > 0 then
    raise notice 'already accepts 25 and 35';
    return;
  end if;
  v_occurrences := (length(v_definition) - length(replace(v_definition, 'v_max_endpoint<>25', ''))) / length('v_max_endpoint<>25');
  if v_occurrences <> 1 then
    raise exception 'expected exactly one v_max_endpoint<>25, found %', v_occurrences;
  end if;
  execute replace(v_definition, 'v_max_endpoint<>25', 'v_max_endpoint not in (25,35)');
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_evaluation' and p.pronargs = 0;
  if position('v_max_endpoint not in (25,35)' in v_definition) = 0 or position('v_max_endpoint<>25' in v_definition) > 0 then
    raise exception 'claim ceiling does not accept 25 and 35 after migration';
  end if;
  if position('v_max_judge<>4' in v_definition) = 0 or position('v_max_cost>0.200000' in v_definition) = 0 then
    raise exception 'judge or wake-cost ceiling altered; refusing';
  end if;
end
$migration$;
