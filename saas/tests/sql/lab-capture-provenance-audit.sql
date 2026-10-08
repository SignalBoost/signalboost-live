begin;
do $t$
declare o uuid:=gen_random_uuid();u uuid:=gen_random_uuid();p uuid:=gen_random_uuid();
 e uuid:=gen_random_uuid();r uuid:=gen_random_uuid();rate uuid:=gen_random_uuid();
 t0 timestamptz:=now()-interval '1 minute'; audit jsonb;
begin
 insert into lab.organizations(id,name) values(o,'phase4-audit');
 insert into lab.universities(id,organization_id,name) values(u,o,'phase4-audit');
 insert into lab.projects(id,organization_id,university_id,name) values(p,o,u,'phase4-audit');
 insert into lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits)
 values(e,o,p,'PRIVATE',1000);
 insert into lab.credit_accounts(organization_id,funded_microcredits) values(o,1000);
 insert into lab.approved_usage_rates(rate_id,organization_id,provider,model,unit,microcredits_per_unit,effective_at,approved_by,approval_ref)
 values(rate,o,'synthetic-provider','test-model','input_token',3,t0-interval '1 minute','test-owner','synthetic-approval-01');
 perform set_config('lab.trusted_organization_id',o::text,true);
 perform lab.apply_credit_event(o,e,r,'reserve',300,'phase4-audit-reserve-001');
 perform lab.capture_rated_usage(o,e,r,'phase4-audit-rated-0001',rate,'synthetic-provider',
 'test-model','input_token',7,t0,0.02,'synthetic-receipt-1');
 audit:=lab.audit_capture_provenance(o);
 if not (audit->>'pass')::boolean or (audit->>'rated_capture_events')::bigint<>1
 then raise exception 'rated capture must reconcile'; end if;
 if (audit->>'provider_receipts_independently_verified')::boolean
 then raise exception 'synthetic receipt falsely certified'; end if;
 perform lab.apply_credit_event(o,e,r,'capture',5,'phase4-audit-legacy-001',0.01,'unrated-legacy-ref');
 audit:=lab.audit_capture_provenance(o);
 if (audit->>'pass')::boolean or (audit->>'unrated_capture_events')::bigint<>1
 or not (audit->>'accounting_pass')::boolean
 then raise exception 'legacy capture was not correctly identified as unrated'; end if;
 raise notice 'PASS: rated usage accounted; legacy capture detected, never financially certified';
end $t$;
rollback;
