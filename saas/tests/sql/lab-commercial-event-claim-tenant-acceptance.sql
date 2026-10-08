-- Disposable PostgreSQL adversarial test: event claims must never cross tenants.
begin;
do $test$
declare
 tenant_a uuid:=gen_random_uuid();
 tenant_b uuid:=gen_random_uuid();
 lot_a uuid:=gen_random_uuid();
 rejected boolean:=false;
begin
 insert into lab.organizations(id,name)
 values (tenant_a,'claim-owner-a'),(tenant_b,'claim-owner-b');
 insert into lab.commercial_credit_lots
  (lot_id,organization_id,kind,granted_credits,source_system,source_reference)
 values (lot_a,tenant_a,'purchased',40,'operator_test_grant','tenant-claim-lot-A001');

 -- Deferred composite FK must reject when constraints are checked.
 begin
   insert into lab.commercial_credit_event_claims
    (source_system,source_reference,organization_id,payload_sha256,lot_id)
   values ('operator_test_grant','cross-tenant-claim-0001',tenant_b,repeat('c',64),lot_a);
   set constraints all immediate;
 exception when foreign_key_violation then
   rejected:=true;
 end;
 if not rejected then
   raise exception 'cross-tenant commercial event claim accepted';
 end if;
 if exists (select 1 from lab.commercial_credit_event_claims
            where source_reference='cross-tenant-claim-0001')
 then raise exception 'cross-tenant event claim survived failed constraint'; end if;

 -- Valid same-tenant event claim remains supported.
 insert into lab.commercial_credit_event_claims
  (source_system,source_reference,organization_id,payload_sha256,lot_id)
 values ('operator_test_grant','same-tenant-claim-00001',tenant_a,repeat('d',64),lot_a);
 set constraints all immediate;
 if (select count(*) from lab.commercial_credit_event_claims
     where lot_id=lot_a and organization_id=tenant_a)<>1
 then raise exception 'legitimate same-tenant claim rejected'; end if;
 raise notice 'PASS event-claim composite tenant FK rejects foreign lots';
end $test$;
rollback;
