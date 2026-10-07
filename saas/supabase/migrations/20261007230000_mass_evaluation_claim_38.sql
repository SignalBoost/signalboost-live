-- saas/supabase/migrations/20261007230000_mass_evaluation_claim_38.sql
-- Owner decision 2026-10-07 (option a): evaluator call ceiling 35 -> 38 (MASS_EVALUATION_ENDPOINT_CALLS) so every exam
-- can finish: the three added calls are baseline solo retries. Apply BEFORE the TypeScript deploys. Accepts 25, 35 AND
-- 38, so it is safe with the old and the new code. Edits the LIVE claim in place (like 20261007010000); only the
-- ceiling test changes. Unchanged: <= $0.20 wake cost, one wake, 4 judge calls, retention wait, all gates.
-- Re-running is safe.
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
  if position('v_max_endpoint not in (25,35,38)' in v_definition) > 0 then
    raise notice 'already accepts 25, 35 and 38';
    return;
  end if;
  v_occurrences := (length(v_definition) - length(replace(v_definition, 'v_max_endpoint not in (25,35)', ''))) / length('v_max_endpoint not in (25,35)');
  if v_occurrences <> 1 then
    raise exception 'expected exactly one v_max_endpoint not in (25,35), found % (apply 20261007010000 first)', v_occurrences;
  end if;
  execute replace(v_definition, 'v_max_endpoint not in (25,35)', 'v_max_endpoint not in (25,35,38)');
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_evaluation' and p.pronargs = 0;
  if position('v_max_endpoint not in (25,35,38)' in v_definition) = 0 then
    raise exception 'claim ceiling does not accept 25, 35 and 38 after migration';
  end if;
  if position('v_max_judge<>4' in v_definition) = 0 or position('v_max_cost>0.200000' in v_definition) = 0 then
    raise exception 'judge or wake-cost ceiling altered; refusing';
  end if;
end
$migration$;
-- Verify (expect one row, accepts_25_35_38 = true):
--   select position('v_max_endpoint not in (25,35,38)' in pg_get_functiondef(p.oid)) > 0 as accepts_25_35_38
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_evaluation' and p.pronargs = 0;
