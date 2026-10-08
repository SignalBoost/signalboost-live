begin;
do $t$
declare o uuid:=gen_random_uuid();u uuid:=gen_random_uuid();p uuid:=gen_random_uuid();
 e uuid:=gen_random_uuid();r uuid:=gen_random_uuid();rate uuid:=gen_random_uuid();
 t0 timestamptz:=now()-interval '2 minutes'; result jsonb; denied boolean;
begin
 insert into lab.organizations(id,name) values(o,'rated-capture-test');
 insert into lab.universities(id,organization_id,name) values(u,o,'rated-capture-test');
 insert into lab.projects(id,organization_id,university_id,name) values(p,o,u,'rated-capture-test');
 insert into lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 values(e,o,p,'PRIVATE',1000);
 insert into lab.credit_accounts(organization_id,funded_microcredits) values(o,1000);
 insert into lab.approved_usage_rates(rate_id,organization_id,provider,model,unit,microcredits_per_unit,effective_at,approved_by,approval_ref)
 values(rate,o,'synthetic-provider','test-model','input_token',3,t0-interval '1 minute','test-owner','approval-synthetic-01');
 perform set_config('lab.trusted_organization_id',o::text,true);
 perform lab.apply_credit_event(o,e,r,'reserve',300,'rated-reserve-synthetic-001');
 result:=lab.capture_rated_usage(o,e,r,'rated-capture-synthetic-01',rate,'synthetic-provider',
 'test-model','input_token',7,t0,0.02,'synthetic-provider-receipt-1');
 if (result->>'replayed')::boolean then raise exception 'initial charge incorrectly replayed'; end if;
 result:=lab.capture_rated_usage(o,e,r,'rated-capture-synthetic-01',rate,'synthetic-provider',
 'test-model','input_token',7,t0,0.02,'synthetic-provider-receipt-1');
 if not (result->>'replayed')::boolean then raise exception 'replay did not reuse event'; end if;
 denied:=false;
 begin
 perform lab.capture_rated_usage(o,e,r,'rated-capture-synthetic-02',rate,'synthetic-provider',
 'test-model','input_token',7,t0,0.02,'synthetic-provider-receipt-1');
 exception when others then denied:=(SQLERRM='lab_receipt_conflict'); end;
 if not denied then raise exception 'same receipt was double charged with different key'; end if;
 denied:=false;
 begin
 perform lab.capture_rated_usage(o,e,r,'rated-capture-synthetic-01',rate,'synthetic-provider',
 'test-model','input_token',8,t0,0.02,'synthetic-provider-receipt-1');
 exception when others then denied:=(SQLERRM='lab_receipt_conflict'); end;
 if not denied then raise exception 'changed usage was silently replayed'; end if;
 if (select count(*) from lab.rated_capture_receipts where organization_id=o)<>1
 or (select captured_microcredits from lab.credit_accounts where organization_id=o)<>21
 then raise exception 'capture/receipt mismatch'; end if;
 if not (lab.reconcile_credit_account(o)->>'pass')::boolean then raise exception 'ledger reconciliation failed'; end if;
 raise notice 'PASS: immutable rated capture provenance and synthetic replay protections';
end $t$;
rollback;
