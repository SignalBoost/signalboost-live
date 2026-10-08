-- Atomic commercial credit grant proof. Not exposed to service_role or customers.
-- A Stripe consumer must NOT call this until separately audited and explicitly enabled.
create table lab.commercial_credit_event_claims (
  source_system text not null check (source_system in ('stripe','operator_test_grant')),
  source_reference text not null check (length(btrim(source_reference)) between 8 and 200),
  organization_id uuid not null references lab.organizations(id),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  lot_id uuid not null unique,
  created_at timestamptz not null default now(),
  primary key (source_system,source_reference),
  foreign key (lot_id) references lab.commercial_credit_lots(lot_id) deferrable initially deferred
);
alter table lab.commercial_credit_event_claims enable row level security;
revoke all on lab.commercial_credit_event_claims from public,anon,authenticated,service_role;
create trigger commercial_event_claim_immutable before update or delete on lab.commercial_credit_event_claims
 for each row execute function lab.prevent_commercial_wallet_mutation();

create function lab.test_atomic_commercial_grant(
 p_organization_id uuid, p_source text, p_source_reference text,
 p_payload_sha256 text, p_kind text, p_credits bigint, p_expiry timestamptz default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,lab as $$
declare prior lab.commercial_credit_event_claims%rowtype; new_lot uuid:=gen_random_uuid();
begin
 if session_user <> 'postgres'
    or current_setting('lab.trusted_organization_id',true) is distinct from p_organization_id::text
 then raise exception 'commercial_grant_authority_denied'; end if;
 -- Only synthetic grants are allowed in this proof contract: no Stripe claims or live revenue.
 if p_source <> 'operator_test_grant' or p_kind not in ('purchased','subscription','promotional')
    or p_credits is null or p_credits<=0 or p_payload_sha256 !~ '^[a-f0-9]{64}$'
    or p_source_reference is null or length(btrim(p_source_reference)) not between 8 and 180
    or (p_kind='purchased' and p_expiry is not null)
 then raise exception 'commercial_grant_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_source||':'||p_source_reference,0));
 select * into prior from lab.commercial_credit_event_claims
   where source_system=p_source and source_reference=p_source_reference;
 if found then
   if prior.organization_id<>p_organization_id or prior.payload_sha256<>p_payload_sha256
      or not exists (
         select 1 from lab.commercial_credit_lots l
         where l.lot_id=prior.lot_id and l.organization_id=p_organization_id
           and l.kind=p_kind and l.granted_credits=p_credits
           and l.expiry_at is not distinct from p_expiry
      )
   then raise exception 'commercial_grant_replay_conflict'; end if;
   return jsonb_build_object('lot_id',prior.lot_id,'replayed',true);
 end if;
 insert into lab.commercial_credit_lots(lot_id,organization_id,kind,granted_credits,
   source_system,source_reference,expiry_at)
 values(new_lot,p_organization_id,p_kind,p_credits,p_source,p_source_reference,p_expiry);
 insert into lab.commercial_credit_journal(organization_id,lot_id,operation,
   amount_credits,event_key,source_reference)
 values(p_organization_id,new_lot,'grant',p_credits,'grant:'||p_source_reference,p_source_reference);
 insert into lab.commercial_credit_event_claims(source_system,source_reference,
   organization_id,payload_sha256,lot_id)
 values(p_source,p_source_reference,p_organization_id,p_payload_sha256,new_lot);
 return jsonb_build_object('lot_id',new_lot,'replayed',false);
end $$;
revoke all on function lab.test_atomic_commercial_grant(uuid,text,text,text,text,bigint,timestamptz)
 from public,anon,authenticated,service_role;
