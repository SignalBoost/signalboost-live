-- Adversarial provenance audit: syntactically linked receipt with wrong rate math must fail.
begin;
do $t$
declare o uuid:=gen_random_uuid();u uuid:=gen_random_uuid();p uuid:=gen_random_uuid();
 e uuid:=gen_random_uuid();r uuid:=gen_random_uuid();rate uuid:=gen_random_uuid();
 t0 timestamptz:=now()-interval '1 minute'; outcome jsonb; audit jsonb;
begin
 insert into lab.organizations(id,name) values(o,'rate-reconciliation-test');
 insert into lab.universities(id,organization_id,name) values(u,o,'rate-reconciliation-test');
 insert into lab.projects(id,organization_id,university_id,name) values(p,o,u,'rate-reconciliation-test');
 insert into lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 values(e,o,p,'PRIVATE',1000);
 insert into lab.credit_accounts(organization_id,funded_microcredits) values(o,1000);
 insert into lab.approved_usage_rates(rate_id,organization_id,provider,model,unit,microcredits_per_unit,effective_at,approved_by,approval_ref)
 values(rate,o,'synthetic-provider','test-model','input_token',3,t0-interval '1 minute','test-owner','synthetic-approval-02');
 perform set_config('lab.trusted_organization_id',o::text,true);
 perform lab.apply_credit_event(o,e,r,'reserve',100,'audit-rate-reserve-001');
 outcome:=lab.capture_rated_usage(o,e,r,'audit-rate-valid-001',rate,'synthetic-provider',
 'test-model','input_token',7,t0,0.02,'rate-receipt-valid');
 audit:=lab.audit_capture_provenance(o);
 if not (audit->>'pass')::boolean then raise exception 'valid rated capture rejected: %',audit; end if;
 outcome:=lab.apply_credit_event(o,e,r,'capture',22,'audit-rate-invalid-001',0.02,'rate-receipt-invalid');
 -- Simulate a forged, internally inconsistent receipt from an unsafe legacy writer.
 insert into lab.rated_capture_receipts(event_id,organization_id,rate_id,provider,model,usage_unit,
 usage_units,used_at,source_receipt_ref,quoted_microcredits)
 values((outcome->>'event_id')::bigint,o,rate,'synthetic-provider','test-model','input_token',
 7,t0,'rate-receipt-invalid',22);
 audit:=lab.audit_capture_provenance(o);
 if (audit->>'pass')::boolean or (audit->>'mismatched_rated_events')::bigint<>1
 or (audit->>'unrated_capture_events')::bigint<>0 or not (audit->>'accounting_pass')::boolean
 then raise exception 'rate-forged capture not detected: %',audit; end if;
 raise notice 'PASS: legitimate capture passes; forged rate math fails closed';
end $t$;
rollback;
