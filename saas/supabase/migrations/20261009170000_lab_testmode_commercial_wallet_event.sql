-- Test-only atomic wallet usage proof; NOT a production or service-role API.
-- The experiment budget ledger and external provider spend remain separate.
create function lab.testmode_commercial_wallet_event(
 p_org uuid,p_lot uuid,p_experiment uuid,p_operation text,
 p_amount bigint,p_key text,p_reservation_key text default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,lab as $$
declare l lab.commercial_credit_lots%rowtype; prior lab.commercial_credit_journal%rowtype;
 total_res bigint; total_capture bigint; total_release bigint; total_reverse bigint;
 allotted bigint; settled bigint; record_id bigint;
begin
 if session_user <> 'postgres'
  or current_setting('lab.trusted_organization_id',true) is distinct from p_org::text
  or current_setting('lab.stripe_test_verification',true) is distinct from 'approved_test_only'
 then raise exception 'wallet_test_authority_denied'; end if;
 if p_operation not in ('reserve','capture','release') or p_amount is null or p_amount<=0
  or length(coalesce(p_key,'')) not between 16 and 200
 then raise exception 'wallet_test_invalid'; end if;
 select * into l from lab.commercial_credit_lots where lot_id=p_lot and organization_id=p_org for update;
 if not found or (l.expiry_at is not null and l.expiry_at<=now())
 then raise exception 'wallet_test_lot_unavailable'; end if;
 if p_experiment is null or not exists(select 1 from lab.experiments
   where id=p_experiment and organization_id=p_org)
 then raise exception 'wallet_test_experiment_invalid'; end if;
 select * into prior from lab.commercial_credit_journal where organization_id=p_org and event_key=p_key;
 if found then
   if prior.lot_id<>p_lot or prior.operation<>p_operation or prior.amount_credits<>p_amount
    or prior.experiment_id is distinct from p_experiment
    or prior.source_reference<>l.source_reference
   then raise exception 'wallet_test_replay_conflict'; end if;
   return jsonb_build_object('journal_id',prior.journal_id,'replayed',true);
 end if;
 select coalesce(sum(amount_credits) filter(where operation='reserve'),0),
 coalesce(sum(amount_credits) filter(where operation='capture'),0),
 coalesce(sum(amount_credits) filter(where operation='release'),0),
 coalesce(sum(amount_credits) filter(where operation in ('refund','chargeback')),0)
 into total_res,total_capture,total_release,total_reverse
 from lab.commercial_credit_journal where lot_id=p_lot;
 if p_operation='reserve' then
  if total_res-total_release+total_reverse > l.granted_credits-p_amount
   then raise exception 'wallet_test_insufficient'; end if;
 else
  if length(coalesce(p_reservation_key,''))<16 or not exists(
    select 1 from lab.commercial_credit_journal where organization_id=p_org
     and lot_id=p_lot and operation='reserve' and event_key=p_reservation_key
     and experiment_id=p_experiment
  ) then raise exception 'wallet_test_reservation_missing'; end if;
  select amount_credits into allotted from lab.commercial_credit_journal
   where organization_id=p_org and lot_id=p_lot and operation='reserve'
    and event_key=p_reservation_key and experiment_id=p_experiment;
  -- Usage events reference their reservation with a deterministic prefix.
  -- Each reservation has one terminal capture and/or release pair.
  select coalesce(sum(amount_credits),0) into settled
    from lab.commercial_credit_journal where organization_id=p_org and lot_id=p_lot
    and operation in ('capture','release') and experiment_id=p_experiment
    and event_key like 'usage:'||p_reservation_key||':%';
  if settled + p_amount > allotted then raise exception 'wallet_test_reservation_oversettled'; end if;
  if p_key not like 'usage:'||p_reservation_key||':%'
   then raise exception 'wallet_test_usage_key_invalid'; end if;
 end if;
 insert into lab.commercial_credit_journal
  (organization_id,lot_id,operation,amount_credits,event_key,source_reference,experiment_id)
 values(p_org,p_lot,p_operation,p_amount,p_key,l.source_reference,p_experiment)
 returning journal_id into record_id;
 return jsonb_build_object('journal_id',record_id,'replayed',false);
end $$;
revoke all on function lab.testmode_commercial_wallet_event(uuid,uuid,uuid,text,bigint,text,text)
 from public,anon,authenticated,service_role;
