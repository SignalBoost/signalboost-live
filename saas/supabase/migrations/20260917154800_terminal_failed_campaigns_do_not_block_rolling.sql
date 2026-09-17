-- A failed campaign remains retryable until recovery terminalizes it by setting completed_at.
-- Once terminalized, it must no longer consume the single rolling campaign concurrency slot.
-- This changes lifecycle accounting only; it does not expand provider spend, retry, promotion,
-- Production traffic, or RunPod authority.

do $$
declare
  v_oid oid;
  v_definition text;
  v_old text := 'where c.status in (''authorized'',''active'',''failed'')' || E'\n    ' || 'and c.expires_at > v_now;';
  v_new text := 'where (c.status in (''authorized'',''active'') or (c.status=''failed'' and c.completed_at is null))' || E'\n    ' || 'and c.expires_at > v_now;';
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'authorize_next_cos_university_mass_distillation_campaign'
  limit 1;

  if v_oid is null then
    raise exception 'rolling_authorizer_missing';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  if position(v_new in v_definition) > 0 then
    return;
  end if;
  if position(v_old in v_definition) = 0 then
    raise exception 'rolling_authorizer_expected_guard_missing';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end $$;
