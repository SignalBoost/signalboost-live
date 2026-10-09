-- Replacement with strict USD test-credit rate conversion. This function does not verify Stripe itself.
-- No customer/service-role execute permission; never connect to a live webhook.
create or replace function lab.testmode_atomic_stripe_settlement(
 p_organization_id uuid, p_event_id text, p_payment_intent text, p_account_id text,
 p_rate_version_id uuid, p_received_minor bigint, p_currency text,
 p_payload_sha256 text, p_credits bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog,lab as $$
declare prior lab.commercial_stripe_settlement_evidence%rowtype;
 lot uuid:=gen_random_uuid(); rate lab.commercial_credit_rate_versions%rowtype;
begin
 if session_user <> 'postgres' or current_setting('lab.trusted_organization_id',true) is distinct from p_organization_id::text
    or current_setting('lab.stripe_test_verification',true) is distinct from 'approved_test_only'
 then raise exception 'stripe_settlement_authority_denied'; end if;
 if p_event_id !~ '^evt_[A-Za-z0-9_]{8,}$' or p_payment_intent !~ '^pi_[A-Za-z0-9_]{8,}$'
 or p_account_id !~ '^acct_[A-Za-z0-9_]{8,}$' or p_currency !~ '^[A-Z]{3}$'
 or p_payload_sha256 !~ '^[a-f0-9]{64}$' or p_received_minor<=0 or p_credits<=0
 then raise exception 'stripe_settlement_invalid'; end if;
 select * into rate from lab.commercial_credit_rate_versions where rate_version_id=p_rate_version_id;
 if not found or rate.currency_code<>p_currency or rate.effective_at>now()
    or (rate.retired_at is not null and rate.retired_at<=now())
 then raise exception 'stripe_settlement_rate_invalid'; end if;
 -- Narrow test-only arithmetic: credit rate is credits per whole USD, paid in cents.
 -- Other currencies and fractional-USD amounts are denied until their minor
 -- units and exact approved price mappings are independently specified.
 if p_currency <> 'USD' or p_received_minor % 100 <> 0
    or (p_received_minor / 100) > (9223372036854775807::bigint / rate.credits_per_unit)
    or p_credits <> (p_received_minor / 100) * rate.credits_per_unit
 then raise exception 'stripe_settlement_credit_rate_mismatch'; end if;
 -- Serialized by payment intent, including distinct events referring to the same payment.
 perform pg_advisory_xact_lock(hashtextextended('stripe-payment:'||p_payment_intent,0));
 select * into prior from lab.commercial_stripe_settlement_evidence
 where stripe_payment_intent_id=p_payment_intent;
 if found then
  if prior.organization_id<>p_organization_id or prior.stripe_event_id<>p_event_id
  or prior.stripe_account_id<>p_account_id or prior.rate_version_id<>p_rate_version_id
  or prior.amount_received_minor<>p_received_minor or prior.currency_code<>p_currency
  or prior.evidence_sha256<>p_payload_sha256
  or not exists (select 1 from lab.commercial_credit_lots l where l.lot_id=prior.lot_id
      and l.organization_id=p_organization_id and l.kind='purchased'
      and l.granted_credits=p_credits and l.source_system='stripe'
      and l.source_reference=p_payment_intent)
  then raise exception 'stripe_settlement_replay_conflict'; end if;
  return jsonb_build_object('lot_id',prior.lot_id,'replayed',true);
 end if;
 -- This proof intentionally takes credits as an argument; pricing verification,
 -- authoritative payment retrieval, and money-to-credits conversion are NOT certified.
 insert into lab.commercial_credit_lots(lot_id,organization_id,kind,granted_credits,source_system,source_reference)
 values(lot,p_organization_id,'purchased',p_credits,'stripe',p_payment_intent);
 insert into lab.commercial_credit_journal(organization_id,lot_id,operation,amount_credits,event_key,source_reference)
 values(p_organization_id,lot,'grant',p_credits,'stripe-grant:'||p_payment_intent,p_payment_intent);
 insert into lab.commercial_credit_event_claims(source_system,source_reference,organization_id,payload_sha256,lot_id)
 values('stripe',p_event_id,p_organization_id,p_payload_sha256,lot);
 insert into lab.commercial_stripe_settlement_evidence
 (organization_id,lot_id,rate_version_id,stripe_event_id,stripe_payment_intent_id,stripe_account_id,
  stripe_livemode,amount_received_minor,currency_code,payment_status,evidence_sha256,verified_at)
 values(p_organization_id,lot,p_rate_version_id,p_event_id,p_payment_intent,p_account_id,
  false,p_received_minor,p_currency,'succeeded',p_payload_sha256,now());
 return jsonb_build_object('lot_id',lot,'replayed',false);
end $$;
revoke all on function lab.testmode_atomic_stripe_settlement(uuid,text,text,text,uuid,bigint,text,text,bigint)
 from public,anon,authenticated,service_role;
