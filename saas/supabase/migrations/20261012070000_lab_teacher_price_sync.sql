-- saas/supabase/migrations/20261012070000_lab_teacher_price_sync.sql
-- Customer LAB: OpenRouter teacher prices kept current automatically from OpenRouter's own public model list.
--   * Called only by the platform's scheduled job (service role). Customers cannot call it, so no customer can set
--     a price for anyone.
--   * Only providers that publish machine-readable prices may sync (today: openrouter). Hand-verified rows for other
--     providers are never touched.
--   * A changed price closes the old row (effective_until = now()) and opens a new one, so runs already priced keep
--     the exact card they reserved against. A model OpenRouter no longer lists is closed, not deleted.
--   * Refuses a short list (fewer than 20 models): a broken response must never close every OpenRouter price.

create or replace function public.itmounts_lab_platform_sync_teacher_rate_cards(
  p_provider_kind text, p_source_url text, p_rows jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare r jsonb;
declare c lab.teacher_rate_cards%rowtype;
declare v_model text; v_in numeric; v_out numeric;
declare seen text[] := '{}';
declare n_new int := 0; n_changed int := 0; n_same int := 0; n_closed int := 0;
begin
  if p_provider_kind is distinct from 'openrouter' then raise exception 'lab_price_sync_provider_unsupported'; end if;
  if p_source_url is null or p_source_url !~ '^https://' then raise exception 'lab_price_sync_source_invalid'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) < 20 then
    raise exception 'lab_price_sync_rows_insufficient';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_model := r->>'model';
    begin
      v_in := round((r->>'input')::numeric, 6); v_out := round((r->>'output')::numeric, 6);
    exception when others then raise exception 'lab_price_sync_row_invalid';
    end;
    if v_model is null or v_model !~ '^[A-Za-z0-9_./:-]{1,240}$' or v_in is null or v_out is null
       or v_in < 0 or v_out < 0 or v_in > 1000 or v_out > 1000 or v_in + v_out <= 0 then
      raise exception 'lab_price_sync_row_invalid';
    end if;
    if v_model = any(seen) then continue; end if;
    seen := seen || v_model;
    select * into c from lab.teacher_rate_cards
     where provider_kind = p_provider_kind and model = v_model and effective_until is null for update;
    if found and c.input_usd_per_mtok = v_in and c.output_usd_per_mtok = v_out then n_same := n_same + 1; continue; end if;
    if found then
      update lab.teacher_rate_cards set effective_until = now() where id = c.id;
      n_changed := n_changed + 1;
    else
      n_new := n_new + 1;
    end if;
    insert into lab.teacher_rate_cards
      (provider_kind, model, input_usd_per_mtok, output_usd_per_mtok, source_url, verified_by, verified_at, effective_from)
    values (p_provider_kind, v_model, v_in, v_out, p_source_url, 'OpenRouter models API (automatic sync)', now(), now());
  end loop;
  update lab.teacher_rate_cards set effective_until = now()
   where provider_kind = p_provider_kind and effective_until is null and effective_from < now() and not (model = any(seen));
  get diagnostics n_closed = row_count;
  return jsonb_build_object('added', n_new, 'changed', n_changed, 'unchanged', n_same, 'closed', n_closed);
end $$;
revoke all on function public.itmounts_lab_platform_sync_teacher_rate_cards(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.itmounts_lab_platform_sync_teacher_rate_cards(text, text, jsonb) to service_role;
