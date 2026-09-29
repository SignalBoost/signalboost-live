-- saas/supabase/migrations/20260929024000_mass_evaluation_claim_25_symmetric_holdout.sql
--
-- Raise the asserted evaluation call ceiling 18 -> 25 so the BASELINE gets the same nine holdout requests the
-- candidate already had (#3480, "equalize mass evaluation answer room"). The TypeScript side is already live at
-- 25 (MASS_EVALUATION_ENDPOINT_CALLS in lib/ai/cos/cosUniversityMassEvaluationContextBudget.ts): every approval
-- now carries 25 while the live claim still demands 18, so the claim refuses every approval and each cron tick
-- reports no_atomically_claimable_mass_distilled_evaluation. The same stall happened on 2026-09-18 (8 vs 14).
--
-- This is a CALL ceiling, not a SPEND ceiling. Unchanged: the <= $0.20 estimated wake cost, the single runtime
-- wake, four judge calls, claim concurrency, exact-artifact identity and canary requirements, residency gating,
-- retry limits, promotion gates, rollback rules and the Production-traffic prohibition.
--
-- 2026-09-29 correction: the first version of this file re-created the function from the 2026-09-25 migration
-- text, which still says interval '12 hours'. Running it would have silently undone the owner's test-phase
-- 10-minute wait (20260929021500). Like that migration, this one edits the LIVE definition in place and swaps
-- only the ceiling, so nothing else in the function can regress. It also re-applies the 10-minute wait in case
-- the earlier version was already run. Re-running is safe, and it fails loudly if the result is not 25 + 10 min.
do $migration$
declare
  fn record;
  definition text;
  updated text;
  changed integer := 0;
  found integer := 0;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_evaluation'
  loop
    found := found + 1;
    definition := pg_get_functiondef(fn.oid);
    updated := replace(definition, 'v_max_endpoint<>18', 'v_max_endpoint<>25');
    updated := replace(updated, 'interval ''12 hours''', 'interval ''10 minutes''');
    if updated <> definition then
      execute updated;
      changed := changed + 1;
    end if;
  end loop;

  if found = 0 then
    raise exception 'claim_next_mass_distilled_evaluation not found';
  end if;

  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_evaluation'
  loop
    definition := pg_get_functiondef(fn.oid);
    if position('v_max_endpoint<>25' in definition) = 0 then
      raise exception 'claim ceiling is not 25 after migration';
    end if;
    if position('interval ''10 minutes''' in definition) = 0 or position('interval ''12 hours''' in definition) > 0 then
      raise exception 'claim wait is not 10 minutes after migration';
    end if;
  end loop;

  raise notice 'claim_next_mass_distilled_evaluation updated: % of % (ceiling 25, wait 10 minutes)', changed, found;
end
$migration$;
