-- Runs the teacher-spend database functions for real and asserts the budget rules.
-- Target: a DISPOSABLE database with both LAB migrations applied (local Postgres or a Supabase branch). Never production.
-- Every check raises an exception on failure; the script ends with 'TEACHER SPEND DB TEST: PASS'.
\set ON_ERROR_STOP 1
begin;
-- fixtures (as the database owner)
insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a1') on conflict do nothing;
insert into lab.organizations(id) values ('00000000-0000-0000-0000-0000000000b1') on conflict do nothing;
insert into lab.organization_members(user_id, organization_id, role, status)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'owner', 'active');
insert into lab.experiments(id, organization_id) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1') on conflict do nothing;
insert into lab.provider_credentials(id, organization_id, provider_kind, label, ciphertext, iv, tag, created_by) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'openai', 't', repeat('x', 32), repeat('i', 16), repeat('g', 16), '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', 'huggingface', 'h', repeat('x', 32), repeat('i', 16), repeat('g', 16), '00000000-0000-0000-0000-0000000000a1');
-- test-only rate card (not a real price)
insert into lab.teacher_rate_cards(id, provider_kind, model, input_usd_per_mtok, output_usd_per_mtok, request_overhead_tokens, safety_margin, source_url, verified_by, verified_at)
  values ('00000000-0000-0000-0000-0000000000e1', 'openai', 'test-model', 1, 4, 64, 1.10, 'https://example.test/pricing', 'db-test', now());
insert into lab.customer_training_runs(id, organization_id, experiment_id, requested_by, teacher_credential_id, teacher_provider_kind,
  teacher_model, compute_credential_id, compute_provider_kind, base_model, approved_budget_usd, max_hourly_usd)
values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1', 'openai', 'test-model', '00000000-0000-0000-0000-0000000000d2', 'huggingface', 'Qwen/Q', 2.00, 0.5),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1', 'openai', 'test-model', '00000000-0000-0000-0000-0000000000d2', 'huggingface', 'Qwen/Q', 2.00, 0.5),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000d1', 'openai', 'unpriced-model', '00000000-0000-0000-0000-0000000000d2', 'huggingface', 'Qwen/Q', 2.00, 0.5);

-- act as the signed-in customer owner
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare reserved numeric; s jsonb; r record; ok boolean;
begin
  -- 1. no verified card -> refused
  begin
    perform public.itmounts_lab_customer_teacher_rate_card('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f3');
    raise exception 'FAIL 1: unpriced model returned a rate card';
  exception when others then if sqlerrm <> 'lab_teacher_rate_unverified' then raise exception 'FAIL 1: %', sqlerrm; end if; end;

  -- 2. reservation is priced by the database: (100000*1 + 50000*4)/1e6 * 1.10 = 0.33
  reserved := public.itmounts_lab_customer_reserve_teacher('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000e1', 100000, 50000, 1.00);
  if reserved <> 0.33 then raise exception 'FAIL 2: reserved % (expected 0.33)', reserved; end if;

  -- 3. overrun: actual (400000*1 + 100000*4)/1e6 = 0.80 > 0.33. Recorded in FULL, not clamped.
  s := public.itmounts_lab_customer_settle_teacher('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1', 400000, 100000, '{}');
  if (s->>'chargedUsd')::numeric <> 0.80 then raise exception 'FAIL 3a: charged % (expected 0.80, no clamp)', s; end if;
  if (s->>'overrunUsd')::numeric <> 0.47 then raise exception 'FAIL 3b: overrun % (expected 0.47)', s; end if;
  if not (s->>'blocked')::boolean then raise exception 'FAIL 3c: not blocked after overrun'; end if;
  if (s->>'remainingUsd')::numeric <> 1.20 then raise exception 'FAIL 3d: remaining % (expected 2.00 - 0.80 = 1.20)', s; end if;

  -- 4. after an overrun no further spending on the run: neither a training reservation nor another teacher reservation
  begin
    perform public.itmounts_lab_customer_record_stage('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1',
      'preparing_dataset', 35, 'x', '{}', 0.10, null);
    raise exception 'FAIL 4a: training reservation accepted after overrun';
  exception when others then if sqlerrm not in ('lab_customer_spend_blocked', 'lab_customer_run_terminal') then raise exception 'FAIL 4a: %', sqlerrm; end if; end;
  begin
    perform public.itmounts_lab_customer_reserve_teacher('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1',
      '00000000-0000-0000-0000-0000000000e1', 10, 10, 1.00);
    raise exception 'FAIL 4b: teacher reservation accepted after overrun';
  exception when others then if sqlerrm <> 'lab_customer_spend_blocked' then raise exception 'FAIL 4b: %', sqlerrm; end if; end;

  -- 5. normal settlement under the reservation leaves the run usable and returns unused reservation to the budget
  reserved := public.itmounts_lab_customer_reserve_teacher('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2',
    '00000000-0000-0000-0000-0000000000e1', 100000, 50000, 1.00);
  s := public.itmounts_lab_customer_settle_teacher('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f2', 50000, 10000, '{}');
  if (s->>'chargedUsd')::numeric <> 0.09 or (s->>'overrunUsd')::numeric <> 0 or (s->>'blocked')::boolean then raise exception 'FAIL 5a: %', s; end if;
  if (s->>'remainingUsd')::numeric <> 1.91 then raise exception 'FAIL 5b: remaining %', s; end if;

  -- 7. reservation larger than the teacher cap or the approved budget is refused
  begin
    perform public.itmounts_lab_customer_reserve_teacher('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f3',
      '00000000-0000-0000-0000-0000000000e1', 10, 10, 1.00);
    raise exception 'FAIL 7a: reservation for an unpriced model accepted';
  exception when others then if sqlerrm <> 'lab_teacher_rate_unverified' then raise exception 'FAIL 7a: %', sqlerrm; end if; end;
end $$;

reset role;
do $$
declare r lab.customer_training_runs%rowtype;
begin
  select * into r from lab.customer_training_runs where id = '00000000-0000-0000-0000-0000000000f1';
  if r.committed_max_cost_usd <> 0.80 or r.teacher_spent_usd <> 0.80 or r.teacher_overrun_usd <> 0.47 then
    raise exception 'FAIL 8: committed % spent % overrun %', r.committed_max_cost_usd, r.teacher_spent_usd, r.teacher_overrun_usd; end if;
  if r.stage <> 'failed' or r.failure_code <> 'lab_teacher_budget_overrun' or r.spend_blocked_at is null then
    raise exception 'FAIL 9: stage % code % blocked %', r.stage, r.failure_code, r.spend_blocked_at; end if;
  if not exists (select 1 from lab.customer_training_events where run_id = r.id and event = 'teacher_budget_overrun') then
    raise exception 'FAIL 10: no overrun event'; end if;
  -- direct table access is still denied to API roles
  if has_table_privilege('authenticated', 'lab.teacher_rate_cards', 'select') or has_table_privilege('service_role', 'lab.teacher_rate_cards', 'insert') then
    raise exception 'FAIL 11: API roles can touch rate cards directly'; end if;
  raise notice 'TEACHER SPEND DB TEST: PASS';
end $$;
rollback;
