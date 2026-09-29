-- saas/supabase/migrations/20260929021500_mass_evaluation_test_phase_retention_delay.sql
--
-- Owner direction 2026-09-28 (test phase): the wait before a mass-distilled student's exam goes from 12 hours
-- to 10 minutes. The TypeScript side reads one value (lib/ai/cos/cosUniversityMassRetentionDelay.ts); this is the
-- matching change in the atomic exam claim. Only the wait changes - no question, threshold or gate.
--
-- The live claim_next_mass_distilled_evaluation is edited in place (its own current definition, with only the
-- interval swapped) instead of being re-created from an older migration file, so nothing else in it can regress.
-- Re-running is safe: once the 12-hour text is gone it does nothing.
do $migration$
declare
  fn record;
  definition text;
  changed integer := 0;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_next_mass_distilled_evaluation'
  loop
    definition := pg_get_functiondef(fn.oid);
    if position('interval ''12 hours''' in definition) > 0 then
      execute replace(definition, 'interval ''12 hours''', 'interval ''10 minutes''');
      changed := changed + 1;
    end if;
  end loop;
  raise notice 'claim_next_mass_distilled_evaluation definitions switched to 10 minutes: %', changed;
end
$migration$;
