-- Synthetic, approved-for-test rate only. Does not validate production prices.
begin;
do $t$
declare org uuid:=gen_random_uuid(); other_org uuid:=gen_random_uuid();
  rate uuid:=gen_random_uuid(); overlap uuid:=gen_random_uuid();
  denied boolean; n bigint; t0 timestamptz:=now() - interval '1 hour';
begin
 insert into lab.organizations(id,name) values(org,'rate-contract-test'),(other_org,'other-rate-org');
 insert into lab.approved_usage_rates(rate_id,organization_id,provider,model,unit,microcredits_per_unit,effective_at,approved_by,approval_ref)
 values(rate,org,'synthetic-provider','test-model','input_token',3,t0,'ci-contract-test','test-approval-001');
 perform set_config('lab.trusted_organization_id',org::text,true);
 n:=lab.quote_usage_microcredits(org,rate,'synthetic-provider','test-model','input_token',7,now());
 if n<>21 then raise exception 'incorrect microcredit conversion'; end if;
 denied:=false;
 begin
  perform lab.quote_usage_microcredits(org,rate,'synthetic-provider','test-model','input_token',0,now());
 exception when others then denied:=(SQLERRM='lab_invalid_usage'); end;
 if not denied then raise exception 'zero usage allowed'; end if;
 denied:=false;
 begin
  perform lab.quote_usage_microcredits(other_org,rate,'synthetic-provider','test-model','input_token',7,now());
 exception when others then denied:=(SQLERRM='lab_tenant_authority_denied'); end;
 if not denied then raise exception 'cross-tenant quote allowed'; end if;
 denied:=false;
 begin
  perform lab.quote_usage_microcredits(org,gen_random_uuid(),'synthetic-provider','test-model','input_token',7,now());
 exception when others then denied:=(SQLERRM='lab_approved_usage_rate_missing'); end;
 if not denied then raise exception 'unknown rate allowed'; end if;
 denied:=false;
 begin update lab.approved_usage_rates set microcredits_per_unit=1 where rate_id=rate;
 exception when others then denied:=(SQLERRM='lab_approved_usage_rate_immutable'); end;
 if not denied then raise exception 'rate mutation allowed'; end if;
 insert into lab.approved_usage_rates(rate_id,organization_id,provider,model,unit,microcredits_per_unit,effective_at,approved_by,approval_ref)
 values(overlap,org,'synthetic-provider','test-model','input_token',4,t0 + interval '10 minutes','ci-contract-test','test-approval-002');
 denied:=false;
 begin
  perform lab.quote_usage_microcredits(org,rate,'synthetic-provider','test-model','input_token',7,now());
 exception when others then denied:=(SQLERRM='lab_approved_usage_rate_ambiguous'); end;
 if not denied then raise exception 'overlapping active rate allowed'; end if;
 raise notice 'PASS: synthetic rate approval, deterministic conversion, missing/ambiguous rate, tenant isolation, immutability';
end $t$;
rollback;
