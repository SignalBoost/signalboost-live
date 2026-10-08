-- Verify exact grant amount and one-to-one immutable event claim; no live payment.
begin;
do $test$
declare org uuid:=gen_random_uuid(); result jsonb; lot uuid;
begin
 insert into lab.organizations(id,name) values(org,'wallet-reconciliation-test');
 perform set_config('lab.trusted_organization_id',org::text,true);
 result:=lab.test_atomic_commercial_grant(org,'operator_test_grant',
   'reconcile-test-event-0001',repeat('f',64),'purchased',75,null);
 lot:=(result->>'lot_id')::uuid;
 if not (select reconciled from lab.commercial_grant_reconciliation where lot_id=lot)
 then raise exception 'valid atomic grant fails reconciliation'; end if;
 -- An extra immutable journal grant must be detected rather than silently netted.
 insert into lab.commercial_credit_journal
  (organization_id,lot_id,operation,amount_credits,event_key,source_reference)
 values(org,lot,'grant',75,'duplicate-grant-reconcile-0001','reconcile-test-event-0001');
 if (select reconciled from lab.commercial_grant_reconciliation where lot_id=lot)
 then raise exception 'duplicate journal grant passes reconciliation'; end if;
 if has_table_privilege('authenticated','lab.commercial_grant_reconciliation','SELECT')
 or has_table_privilege('service_role','lab.commercial_grant_reconciliation','SELECT')
 then raise exception 'reconciliation view exposed to customer or service role'; end if;
 raise notice 'PASS valid grant reconciliation, duplicate grant detection and closed privileges';
end $test$;
rollback;
