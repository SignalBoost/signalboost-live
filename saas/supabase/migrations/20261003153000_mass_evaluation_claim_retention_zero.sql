--
-- Owner 2026-10-03: "in a production line products are built continuously, secs by secs, minutes by minutes not
-- hours", and "build a Ferrari not a Lada."
--
-- The atomic claim required an artifact to have EXISTED for ten minutes before its independent exam could run:
--     and a.created_at <= v_now - interval '10 minutes'
-- The reason that wait is going away is the reason recorded when it was cut from 12 hours to 10 minutes on
-- 2026-09-28: a trained artifact is an immutable, hash-pinned adapter, so its answers do not change while it waits.
-- The wait adds time, not evidence. Ten minutes was charged to every single artifact for nothing.
--
-- The retention CHECK is untouched: same questions, same references, same non-regression rule, same judge. Only the
-- compulsory idling before it is removed. `cosUniversityMassRetentionDelay.ts` ships the matching TypeScript value
-- (now 0, and buyer-configurable via COS_UNIVERSITY_RETENTION_DELAY_MINUTES for anyone whose policy needs a soak).
--
-- This rewrites ONLY that one interval inside the existing function, rather than restating 320 lines of claim logic
-- that must stay byte-for-byte identical. It verifies the pattern is present exactly once and raises if it is not,
-- so a silent no-op is impossible.
do $outer$
declare
  v_definition text;
  v_occurrences integer;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'claim_next_mass_distilled_evaluation'
    and p.pronargs = 0;

  if v_definition is null then
    raise exception 'claim_next_mass_distilled_evaluation() not found; cannot remove the retention wait';
  end if;

  -- Already applied: nothing to do, and re-running this migration must stay safe.
  if position('interval ''10 minutes''' in v_definition) = 0 then
    raise notice 'retention wait already removed from claim_next_mass_distilled_evaluation()';
    return;
  end if;

  v_occurrences := (length(v_definition) - length(replace(v_definition, 'interval ''10 minutes''', '')))
    / length('interval ''10 minutes''');
  if v_occurrences <> 1 then
    raise exception 'expected exactly one retention interval in claim_next_mass_distilled_evaluation(), found %', v_occurrences;
  end if;

  v_definition := replace(v_definition, 'interval ''10 minutes''', 'interval ''0 minutes''');
  execute v_definition;

  raise notice 'retention wait removed: claim_next_mass_distilled_evaluation() now admits an artifact as soon as it exists';
end
$outer$;

-- Prove it took, in the same migration, so a partial apply cannot pass silently.
do $verify$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'claim_next_mass_distilled_evaluation'
    and p.pronargs = 0;

  if position('interval ''10 minutes''' in v_definition) > 0 then
    raise exception 'retention wait is still present after the rewrite';
  end if;
  if position('a.created_at <= v_now - interval' in v_definition) = 0 then
    raise exception 'the retention clause itself is missing; the claim logic was altered beyond the interval';
  end if;
end
$verify$;
