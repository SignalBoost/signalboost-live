-- Phase 4 BYOI: bounded, customer-owned experiment accounting contract.
-- Synthetic usage proves governed ledger behavior, NOT external-provider authenticity.
begin;
do $t$
declare
  org_a uuid:=gen_random_uuid(); org_b uuid:=gen_random_uuid();
  uni_a uuid:=gen_random_uuid(); proj_a uuid:=gen_random_uuid(); exp_a uuid:=gen_random_uuid();
  reservation_a uuid:=gen_random_uuid(); rate_a uuid:=gen_random_uuid();
  used_at_ timestamptz:=now()-interval '1 minute';
  charged jsonb; audit jsonb; denied boolean;
begin
  insert into lab.organizations(id,name) values(org_a,'byoi-tenant-A'),(org_b,'byoi-tenant-B');
  insert into lab.universities(id,organization_id,name) values(uni_a,org_a,'byoi-university');
  insert into lab.projects(id,organization_id,university_id,name) values(proj_a,org_a,uni_a,'byoi-project');
  insert into lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
    values(exp_a,org_a,proj_a,'PRIVATE',100);
  insert into lab.credit_accounts(organization_id,funded_microcredits) values(org_a,100),(org_b,100);
  insert into lab.approved_usage_rates(rate_id,organization_id,provider,model,unit,microcredits_per_unit,effective_at,approved_by,approval_ref)
    values(rate_a,org_a,'customer-test-adapter','test-model','input_token',3,used_at_-interval '1 minute','byoi-test-owner','byoi-approval-0001');
  perform set_config('lab.trusted_organization_id',org_a::text,true);
  perform lab.apply_credit_event(org_a,exp_a,reservation_a,'reserve',90,'byoi-reserve-test-00001');
  charged:=lab.capture_rated_usage(org_a,exp_a,reservation_a,'byoi-capture-test-0001',rate_a,
    'customer-test-adapter','test-model','input_token',10,used_at_,0.03,'byoi-test-provider-receipt-001');
  if (charged->>'replayed')::boolean then raise exception 'initial BYOI capture replayed'; end if;
  charged:=lab.capture_rated_usage(org_a,exp_a,reservation_a,'byoi-capture-test-0001',rate_a,
    'customer-test-adapter','test-model','input_token',10,used_at_,0.03,'byoi-test-provider-receipt-001');
  if not (charged->>'replayed')::boolean then raise exception 'BYOI retry double charged'; end if;
  denied:=false;
  begin
    perform lab.capture_rated_usage(org_a,exp_a,reservation_a,'byoi-invalid-receipt-1',rate_a,
      'customer-test-adapter','test-model','input_token',10,used_at_,0.03,'byoi-test-provider-receipt-001');
  exception when others then denied:=true;
  end;
  if not denied then raise exception 'duplicate customer receipt with different key was charged'; end if;
  denied:=false;
  begin
    perform lab.capture_rated_usage(org_b,exp_a,reservation_a,'byoi-cross-tenant-01',rate_a,
      'customer-test-adapter','test-model','input_token',10,used_at_,0.03,'byoi-cross-tenant-receipt');
  exception when others then denied:=true;
  end;
  if not denied then raise exception 'tenant B charged against tenant A'; end if;
  denied:=false;
  begin
    perform lab.apply_credit_event(org_a,exp_a,gen_random_uuid(),'reserve',71,'byoi-over-budget-0001');
  exception when others then denied:=true;
  end;
  if not denied then raise exception 'experiment budget overrun accepted'; end if;
  perform lab.apply_credit_event(org_a,exp_a,reservation_a,'release',60,'byoi-release-unused-01');
  audit:=lab.audit_capture_provenance(org_a);
  if not (audit->>'pass')::boolean or (audit->>'capture_events')::bigint<>1
  then raise exception 'BYOI rated capture audit failed %',audit; end if;
  if (audit->>'provider_receipts_independently_verified')::boolean
  then raise exception 'synthetic provider usage falsely certified'; end if;
  if (select reserved_microcredits from lab.credit_accounts where organization_id=org_a)<>0
   or (select captured_microcredits from lab.credit_accounts where organization_id=org_a)<>30
  then raise exception 'incorrect final BYOI balances'; end if;
  raise notice 'PASS BYOI test-owned usage: budget, exactly-once capture, release, tenant denial, and fail-closed evidence classification';
end $t$;
rollback;
