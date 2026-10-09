-- Approved-rate conversion is enforced even for privileged synthetic settlements.
begin;
do $t$
declare
 a uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); rejected boolean;
begin
 insert into lab.organizations(id,name) values(a,'rate-guard-test');
 insert into lab.commercial_credit_rate_versions
 (rate_version_id,currency_code,denomination,software_service,credits_per_unit,effective_at,approval_ref)
 values(r,'USD','per-usd','governed-lab-work',10,now()-interval '1 day','test-rate-approval');
 perform set_config('lab.trusted_organization_id',a::text,true);
 perform set_config('lab.stripe_test_verification','approved_test_only',true);
 rejected:=false;
 begin
  perform lab.testmode_atomic_stripe_settlement(a,'evt_badcredit1001','pi_badcredit1001',
   'acct_badcredit1001',r,100,'USD',repeat('a',64),999);
 exception when raise_exception then
  rejected:=true;
 end;
 if not rejected then raise exception 'unpriced credits minted'; end if;
 rejected:=false;
 begin
  perform lab.testmode_atomic_stripe_settlement(a,'evt_fraction1001','pi_fraction1001',
   'acct_fraction1001',r,101,'USD',repeat('b',64),10);
 exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'ambiguous fractional USD payment accepted'; end if;
 rejected:=false;
 begin
  perform lab.testmode_atomic_stripe_settlement(a,'evt_othercurrency1','pi_othercurrency1',
   'acct_othercurrency1',r,100,'EUR',repeat('c',64),10);
 exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'unapproved currency accepted'; end if;
 if exists (select 1 from lab.commercial_credit_lots where organization_id=a)
 then raise exception 'denied pricing claim minted a credit lot'; end if;
 perform lab.testmode_atomic_stripe_settlement(a,'evt_correctrate1','pi_correctrate1',
  'acct_correctrate1',r,200,'USD',repeat('d',64),20);
 if (select count(*) from lab.commercial_credit_lots where organization_id=a)<>1
 then raise exception 'valid rate conversion rejected'; end if;
 raise notice 'PASS deterministic USD rate conversion and closed malformed amounts';
end $t$;
rollback;
