begin;
do $t$
declare org uuid:=gen_random_uuid(); university uuid:=gen_random_uuid(); project uuid:=gen_random_uuid(); exp uuid:=gen_random_uuid(); lot uuid:=gen_random_uuid(); first jsonb; again jsonb; denied boolean;
begin
 insert into lab.organizations(id,name) values(org,'commercial-wallet-usage-test');
 insert into lab.universities(id,organization_id,name) values(university,org,'test-university');
 insert into lab.projects(id,organization_id,university_id,name) values(project,org,university,'test-project');
 insert into lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 values(exp,org,project,'PRIVATE',10000);
 insert into lab.commercial_credit_lots(lot_id,organization_id,kind,granted_credits,source_system,source_reference)
 values(lot,org,'purchased',100,'operator_test_grant','test-source-00001');
 insert into lab.commercial_credit_journal(organization_id,lot_id,operation,amount_credits,event_key,source_reference)
 values(org,lot,'grant',100,'grant-test-source-00001','test-source-00001');
 perform set_config('lab.trusted_organization_id',org::text,true);
 denied:=false;
 begin perform lab.testmode_commercial_wallet_event(org,lot,exp,'reserve',60,'reserve-usage-test-001'); exception when others then denied:=true; end;
 if not denied then raise exception 'unverified reserve permitted'; end if;
 perform set_config('lab.stripe_test_verification','approved_test_only',true);
 first:=lab.testmode_commercial_wallet_event(org,lot,exp,'reserve',60,'reserve-usage-test-001');
 again:=lab.testmode_commercial_wallet_event(org,lot,exp,'reserve',60,'reserve-usage-test-001');
 if (first->>'replayed')::boolean or not (again->>'replayed')::boolean then raise exception 'reserve replay incorrect'; end if;
 denied:=false;
 begin perform lab.testmode_commercial_wallet_event(org,lot,exp,'reserve',41,'reserve-usage-test-002'); exception when others then denied:=true; end;
 if not denied then raise exception 'overspend permitted'; end if;
 perform lab.testmode_commercial_wallet_event(org,lot,exp,'capture',40,'usage:reserve-usage-test-001:capture','reserve-usage-test-001');
 perform lab.testmode_commercial_wallet_event(org,lot,exp,'release',20,'usage:reserve-usage-test-001:release','reserve-usage-test-001');
 denied:=false;
 begin perform lab.testmode_commercial_wallet_event(org,lot,exp,'capture',1,'usage:reserve-usage-test-001:extra','reserve-usage-test-001'); exception when others then denied:=true; end;
 if not denied then raise exception 'reserve oversettlement permitted'; end if;
 perform lab.testmode_commercial_wallet_event(org,lot,exp,'reserve',60,'reserve-usage-test-002');
 if (select count(*) from lab.commercial_credit_journal where organization_id=org and operation='reserve')<>2 then raise exception 'reserve replay minted duplicate'; end if;
 if has_function_privilege('service_role','lab.testmode_commercial_wallet_event(uuid,uuid,uuid,text,bigint,text,text)','EXECUTE') then raise exception 'service role can debit'; end if;
end $t$;
rollback;