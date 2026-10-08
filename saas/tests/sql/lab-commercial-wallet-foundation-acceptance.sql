-- Run after the isolated commercial-wallet foundation migration on a disposable DB.
begin;
do $t$
declare org_id uuid:=gen_random_uuid();other_org uuid:=gen_random_uuid();lot uuid:=gen_random_uuid();denied boolean;
begin
  if has_table_privilege('anon','lab.commercial_credit_lots','INSERT')
   or has_table_privilege('authenticated','lab.commercial_credit_journal','SELECT')
   or has_table_privilege('service_role','lab.commercial_credit_journal','INSERT')
  then raise exception 'commercial wallet privilege exposed before certification'; end if;
  insert into lab.organizations(id,name) values(org_id,'wallet-foundation-test');
  insert into lab.commercial_credit_lots(lot_id,organization_id,kind,granted_credits,source_system,source_reference)
  values(lot,org_id,'purchased',100,'operator_test_grant','acceptance-00001');
  denied:=false;
  begin
    update lab.commercial_credit_lots set granted_credits=200 where lot_id=lot;
  exception when others then denied:=true;
  end;
  if not denied then raise exception 'mutable purchased lot'; end if;
  denied:=false;
  begin
    insert into lab.commercial_credit_lots(organization_id,kind,granted_credits,source_system,source_reference,expiry_at)
    values(org_id,'purchased',10,'operator_test_grant','acceptance-00002',now()+interval '30 days');
  exception when check_violation then denied:=true;
  end;
  if not denied then raise exception 'purchased credits expire without permission'; end if;
  denied:=false;
  begin
    insert into lab.commercial_credit_lots(organization_id,kind,granted_credits,source_system,source_reference)
    values(org_id,'purchased',500,'operator_test_grant','acceptance-00001');
  exception when unique_violation then denied:=true;
  end;
  if not denied then raise exception 'duplicate source lot accepted'; end if;
  insert into lab.organizations(id,name) values(other_org,'wallet-foundation-other-tenant');
  denied:=false;
  begin
    insert into lab.commercial_credit_journal(organization_id,lot_id,operation,amount_credits,event_key,source_reference)
    values(other_org,lot,'grant',100,'wallet-cross-tenant-test-0001','acceptance-foreign-lot-01');
  exception when foreign_key_violation then denied:=true;
  end;
  if not denied then raise exception 'cross-tenant commercial journal lot accepted'; end if;
  raise notice 'PASS wallet schema isolated, immutable and purchased credits do not expire';
end $t$;
rollback;
