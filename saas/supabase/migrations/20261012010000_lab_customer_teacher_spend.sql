-- Customer LAB: teacher API spend.
--   * Prices come ONLY from platform-verified rate cards (source URL, verifier, verification date, validity window).
--     Customers never enter prices; a teacher with no active verified card cannot be used.
--   * The caller reserves conservative TOKEN bounds; this database prices them from the card x safety margin.
--   * Settlement prices ACTUAL tokens and records the full amount, even above the reservation. An overrun sets
--     spend_blocked_at, fails the run and refuses every further reservation (teacher or training) on it.
-- Additive. Depends on 20261012000000_lab_customer_provider_credentials_and_training.

create table if not exists lab.teacher_rate_cards (
  id uuid primary key default gen_random_uuid(),
  provider_kind text not null check (length(btrim(provider_kind)) between 1 and 40),
  model text not null check (length(btrim(model)) between 1 and 240),
  input_usd_per_mtok numeric(12,6) not null check (input_usd_per_mtok >= 0 and input_usd_per_mtok <= 1000),
  output_usd_per_mtok numeric(12,6) not null check (output_usd_per_mtok >= 0 and output_usd_per_mtok <= 1000),
  -- Chat-template / message tokens the provider adds per request on top of the prompt bytes.
  request_overhead_tokens int not null default 64 check (request_overhead_tokens between 0 and 100000),
  -- Reservation multiplier for provider rounding / surcharges. Settlement uses the plain rates.
  safety_margin numeric(4,2) not null default 1.10 check (safety_margin >= 1 and safety_margin <= 3),
  source_url text not null check (source_url ~ '^https://'),
  verified_by text not null check (length(btrim(verified_by)) between 1 and 120),
  verified_at timestamptz not null,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  check (input_usd_per_mtok + output_usd_per_mtok > 0),
  check (effective_until is null or effective_until > effective_from)
);
create unique index if not exists lab_teacher_rate_cards_open_uidx
  on lab.teacher_rate_cards(provider_kind, model) where effective_until is null;
alter table lab.teacher_rate_cards enable row level security;
-- Platform-maintained: written only by the database owner (migration / platform admin). Nobody else touches the table.
revoke all on lab.teacher_rate_cards from public, anon, authenticated, service_role;

alter table lab.customer_training_runs
  add column if not exists teacher_rate_card_id uuid references lab.teacher_rate_cards(id),
  add column if not exists teacher_input_token_bound bigint check (teacher_input_token_bound is null or teacher_input_token_bound >= 0),
  add column if not exists teacher_output_token_bound bigint check (teacher_output_token_bound is null or teacher_output_token_bound >= 0),
  add column if not exists teacher_input_tokens bigint check (teacher_input_tokens is null or teacher_input_tokens >= 0),
  add column if not exists teacher_output_tokens bigint check (teacher_output_tokens is null or teacher_output_tokens >= 0),
  add column if not exists teacher_reserved_usd numeric(12,6) not null default 0 check (teacher_reserved_usd >= 0),
  add column if not exists teacher_spent_usd numeric(12,6) not null default 0 check (teacher_spent_usd >= 0),
  add column if not exists teacher_overrun_usd numeric(12,6) not null default 0 check (teacher_overrun_usd >= 0),
  add column if not exists teacher_reservation_state text
    check (teacher_reservation_state is null or teacher_reservation_state in ('reserved','settled'));

create or replace function lab.active_teacher_rate_card(p_provider_kind text, p_model text)
returns lab.teacher_rate_cards language sql stable security definer set search_path = pg_catalog, lab as $$
  select * from lab.teacher_rate_cards
   where provider_kind = p_provider_kind and model = p_model
     and effective_from <= now() and (effective_until is null or effective_until > now())
   order by effective_from desc limit 1
$$;
revoke all on function lab.active_teacher_rate_card(text,text) from public, anon, authenticated, service_role;

-- Rate card for a run's teacher (any member may read the price that applies to their run).
create or replace function public.itmounts_lab_customer_teacher_rate_card(p_organization_id uuid, p_run_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
declare r lab.customer_training_runs%rowtype;
declare c lab.teacher_rate_cards%rowtype;
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_training_forbidden'; end if;
  select * into r from lab.customer_training_runs where id = p_run_id and organization_id = p_organization_id;
  if not found then raise exception 'lab_customer_run_not_found'; end if;
  c := lab.active_teacher_rate_card(r.teacher_provider_kind, r.teacher_model);
  if c.id is null then raise exception 'lab_teacher_rate_unverified'; end if;
  return jsonb_build_object('id', c.id, 'inputUsdPerMTok', c.input_usd_per_mtok, 'outputUsdPerMTok', c.output_usd_per_mtok,
    'requestOverheadTokens', c.request_overhead_tokens, 'safetyMargin', c.safety_margin,
    'sourceUrl', c.source_url, 'verifiedAt', c.verified_at);
end $$;

-- Reserve: owner/admin. The database prices the token bounds from the verified card; caller-supplied USD is never trusted.
create or replace function public.itmounts_lab_customer_reserve_teacher(
  p_organization_id uuid, p_run_id uuid, p_rate_card_id uuid, p_input_token_bound bigint, p_output_token_bound bigint, p_cap_usd numeric
) returns numeric language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
declare r lab.customer_training_runs%rowtype;
declare c lab.teacher_rate_cards%rowtype;
declare usd numeric;
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_training_forbidden';
  end if;
  if coalesce(p_input_token_bound, 0) <= 0 or coalesce(p_output_token_bound, 0) <= 0 or coalesce(p_cap_usd, 0) <= 0 then
    raise exception 'lab_customer_teacher_budget_invalid';
  end if;
  select * into r from lab.customer_training_runs where id = p_run_id and organization_id = p_organization_id for update;
  if not found then raise exception 'lab_customer_run_not_found'; end if;
  if r.spend_blocked_at is not null then raise exception 'lab_customer_spend_blocked'; end if;
  if r.stage not in ('authorized','generating_teacher_data') or r.teacher_reservation_state is not null then
    raise exception 'lab_customer_teacher_reservation_state';
  end if;
  c := lab.active_teacher_rate_card(r.teacher_provider_kind, r.teacher_model);
  if c.id is null or c.id <> p_rate_card_id then raise exception 'lab_teacher_rate_unverified'; end if;
  usd := ceil(((p_input_token_bound * c.input_usd_per_mtok + p_output_token_bound * c.output_usd_per_mtok) / 1000000.0)
              * c.safety_margin * 1000000) / 1000000;
  if usd > p_cap_usd or r.committed_max_cost_usd + usd > r.approved_budget_usd then
    raise exception 'lab_customer_teacher_budget_exceeded';
  end if;
  update lab.customer_training_runs set
    committed_max_cost_usd = committed_max_cost_usd + usd,
    teacher_reserved_usd = usd, teacher_reservation_state = 'reserved', teacher_rate_card_id = c.id,
    teacher_input_token_bound = p_input_token_bound, teacher_output_token_bound = p_output_token_bound,
    updated_at = now()
  where id = r.id;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (r.id, p_organization_id, 'teacher_budget_reserved', jsonb_build_object('usd', usd, 'user', uid, 'rateCardId', c.id,
    'inputTokenBound', p_input_token_bound, 'outputTokenBound', p_output_token_bound, 'safetyMargin', c.safety_margin), 'customer');
  return usd;
end $$;

-- Settle: prices ACTUAL tokens from the same card and records the full amount. Never clamped to the reservation.
-- Overrun -> committed cost keeps the true total, the run fails and spending on it is blocked.
create or replace function public.itmounts_lab_customer_settle_teacher(
  p_organization_id uuid, p_run_id uuid, p_input_tokens bigint, p_output_tokens bigint, p_detail jsonb
) returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
declare r lab.customer_training_runs%rowtype;
declare c lab.teacher_rate_cards%rowtype;
declare charged numeric;
declare overrun numeric;
declare in_tok bigint;
declare out_tok bigint;
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_training_forbidden';
  end if;
  select * into r from lab.customer_training_runs where id = p_run_id and organization_id = p_organization_id for update;
  if not found then raise exception 'lab_customer_run_not_found'; end if;
  if r.teacher_reservation_state is distinct from 'reserved' then raise exception 'lab_customer_no_open_teacher_reservation'; end if;
  select * into c from lab.teacher_rate_cards where id = r.teacher_rate_card_id;
  -- Missing counts are charged at the full bound, never at zero.
  in_tok := greatest(coalesce(p_input_tokens, r.teacher_input_token_bound), 0);
  out_tok := greatest(coalesce(p_output_tokens, r.teacher_output_token_bound), 0);
  charged := ceil(((in_tok * c.input_usd_per_mtok + out_tok * c.output_usd_per_mtok) / 1000000.0) * 1000000) / 1000000;
  overrun := greatest(charged - r.teacher_reserved_usd, 0);
  update lab.customer_training_runs set
    committed_max_cost_usd = committed_max_cost_usd - teacher_reserved_usd + charged,
    teacher_spent_usd = charged, teacher_overrun_usd = overrun,
    teacher_input_tokens = in_tok, teacher_output_tokens = out_tok,
    teacher_reservation_state = 'settled',
    spend_blocked_at = case when overrun > 0 or committed_max_cost_usd - teacher_reserved_usd + charged > approved_budget_usd
                            then now() else spend_blocked_at end,
    spend_blocked_reason = case when overrun > 0 then 'teacher_overrun' else spend_blocked_reason end,
    stage = case when overrun > 0 then 'failed' else stage end,
    failure_code = case when overrun > 0 then 'lab_teacher_budget_overrun' else failure_code end,
    status_message = case when overrun > 0 then left('Teacher spending exceeded its reservation by $' || overrun::text || '; further spending is blocked.', 300) else status_message end,
    stage_token_hash = case when overrun > 0 then null else stage_token_hash end,
    updated_at = now()
  where id = r.id
  returning * into r;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (r.id, p_organization_id, case when overrun > 0 then 'teacher_budget_overrun' else 'teacher_budget_settled' end,
    coalesce(p_detail, '{}'::jsonb) || jsonb_build_object('inputTokens', in_tok, 'outputTokens', out_tok, 'chargedUsd', charged,
      'reservedUsd', r.teacher_reserved_usd, 'overrunUsd', overrun, 'rateCardId', c.id), 'customer');
  return jsonb_build_object('chargedUsd', charged, 'overrunUsd', overrun, 'blocked', r.spend_blocked_at is not null,
    'remainingUsd', greatest(r.approved_budget_usd - r.committed_max_cost_usd, 0));
end $$;

-- Runs list now shows teacher spend and any block.
create or replace function public.itmounts_lab_customer_list_training_runs(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_training_forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'runId', id, 'experimentId', experiment_id, 'stage', stage, 'progressPercent', progress_percent,
      'statusMessage', status_message, 'teacherProviderKind', teacher_provider_kind, 'teacherModel', teacher_model,
      'baseModel', base_model, 'approvedBudgetUsd', approved_budget_usd, 'committedMaxCostUsd', committed_max_cost_usd,
      'teacherReservedUsd', teacher_reserved_usd, 'teacherSpentUsd', teacher_spent_usd, 'teacherOverrunUsd', teacher_overrun_usd,
      'teacherReservationState', teacher_reservation_state, 'spendBlocked', spend_blocked_at is not null,
      'hfJobUrl', hf_job_url, 'artifactRepo', artifact_repo, 'artifactRevision', artifact_revision,
      'artifactHash', artifact_hash, 'failureCode', failure_code, 'createdAt', created_at, 'updatedAt', updated_at)
      order by created_at desc)
    from lab.customer_training_runs where organization_id = p_organization_id), '[]'::jsonb);
end $$;

revoke all on function public.itmounts_lab_customer_teacher_rate_card(uuid,uuid) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_reserve_teacher(uuid,uuid,uuid,bigint,bigint,numeric) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_settle_teacher(uuid,uuid,bigint,bigint,jsonb) from public, anon, service_role;
grant execute on function public.itmounts_lab_customer_teacher_rate_card(uuid,uuid) to authenticated;
grant execute on function public.itmounts_lab_customer_reserve_teacher(uuid,uuid,uuid,bigint,bigint,numeric) to authenticated;
grant execute on function public.itmounts_lab_customer_settle_teacher(uuid,uuid,bigint,bigint,jsonb) to authenticated;
