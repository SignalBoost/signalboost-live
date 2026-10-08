begin;
do $t$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); v jsonb; id uuid; denied boolean;
begin
 insert into lab.organizations(id,name) values(a,'wallet-atomic-A'),(b,'wallet-atomic-B');
 perform set_config('lab.trusted_organization_id',a::text,true);
 v:=lab.test_atomic_commercial_grant(a,'operator_test_grant','synthetic-event-0001',repeat('a',64),'purchased',250,null);
 if (v->>'replayed')::boolean then raise exception 'initial grant replayed'; end if;
 id:=(v->>'lot_id')::uuid;
 v:=lab.test_atomic_commercial_grant(a,'operator_test_grant','synthetic-event-0001',repeat('a',64),'purchased',250,null);
 if not (v->>'replayed')::boolean or (v->>'lot_id')::uuid<>id then
 raise exception 'replay did not preserve exact lot'; end if;
 denied:=false;
 begin
 perform lab.test_atomic_commercial_grant(a,'operator_test_grant','synthetic-event-0001',repeat('a',64),'purchased',251,null);
 exception when others then denied:=true;
 end;
 if not denied then raise exception 'changed grant amount allowed'; end if;
 denied:=false;
 begin
 perform set_config('lab.trusted_organization_id',b::text,true);
 perform lab.test_atomic_commercial_grant(b,'operator_test_grant','synthetic-event-0001',repeat('a',64),'purchased',250,null);
 exception when others then denied:=true;
 end;
 if not denied then raise exception 'cross tenant replay allowed'; end if;
 perform set_config('lab.trusted_organization_id',a::text,true);
 denied:=false;
 begin
 perform lab.test_atomic_commercial_grant(a,'stripe','synthetic-event-0002',repeat('b',64),'purchased',250,null);
 exception when others then denied:=true;
 end;
 if not denied then raise exception 'live Stripe grant authority accidentally exposed'; end if;
 if (select count(*) from lab.commercial_credit_journal where organization_id=a)<>1
   or (select count(*) from lab.commercial_credit_lots where organization_id=a)<>1
   or (select count(*) from lab.commercial_credit_event_claims where organization_id=a)<>1
 then raise exception 'atomic grant count mismatch'; end if;
 if has_function_privilege('service_role',
  'lab.test_atomic_commercial_grant(uuid,text,text,text,text,bigint,timestamptz)','EXECUTE')
 then raise exception 'service role should not execute test grant'; end if;
 raise notice 'PASS atomic test-only grant, idempotent replay, conflicting payload and tenant denial';
end $t$;
rollback;
