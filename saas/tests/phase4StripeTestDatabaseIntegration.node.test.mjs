// CI-only integration proof: signed synthetic Stripe test event -> trusted executor -> real PostgreSQL transaction.
// No live Stripe API, no deployment endpoint, no persisted credit grants (ROLLBACK).
import test from 'node:test'
import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {stageVerifiedTestSettlement} from '../lib/billing/phase4VerifiedTestSettlementHandoff.mjs'

const org='12345678-1234-4234-8234-123456789abc'
const rate='12345678-1234-4234-8234-123456789abd'
const experiment='12345678-1234-4234-8234-123456789abe'
const project='12345678-1234-4234-8234-123456789abf'
const university='12345678-1234-4234-8234-123456789ac0'
const now=1800000000, secret='whsec_ci_synthetic_only_987654'
const event={id:'evt_testdatabase0001',type:'payment_intent.succeeded',livemode:false,data:{object:{id:'pi_testdatabase0001'}}}
const rawBody=JSON.stringify(event)
const signatureHeader='t='+now+',v1='+createHmac('sha256',secret).update(now+'.'+rawBody).digest('hex')
const payment={id:'pi_testdatabase0001',livemode:false,status:'succeeded',amount:500,amount_received:500,currency:'usd',metadata:{lab_organization_id:org,purpose:'itmounts_lab_credits',price_version_id:rate}}
const api=async url=>({ok:true,json:async()=>url.endsWith('/v1/account')?{object:'account',id:'acct_testdatabase0001'}:payment})
const input={trustedTestHost:true,organizationId:org,tenantId:org,rateVersionId:rate,approvedPrice:{currency:'usd',amountMinor:500,credits:50,rateVersionId:rate},rawBody,signatureHeader,webhookSecret:secret,nowSeconds:now,stripeSecretKey:'sk_test_synthetic_ci_only',stripeAccountId:'acct_testdatabase0001',fetchImpl:api}

test('verified test payment settles and spends inside one rollback-only PostgreSQL transaction',async()=>{
 if(process.env.CI!=='true'||!process.env.PGDATABASE) throw Error('isolated_postgres_ci_required')
 let called=0
 const result=await stageVerifiedTestSettlement({...input,executeTestSettlement:args=>{
  called++
  for(const [name,value,pattern] of [
   ['org',args.organizationId,/^[0-9a-f-]{36}$/],['event',args.eventId,/^evt_[A-Za-z0-9_]+$/],
   ['intent',args.paymentIntentId,/^pi_[A-Za-z0-9_]+$/],['account',args.accountId,/^acct_[A-Za-z0-9_]+$/],
   ['rate',args.rateVersionId,/^[0-9a-f-]{36}$/],['digest',args.payloadSha256,/^[a-f0-9]{64}$/]
  ]) if(!pattern.test(value)) throw Error('ci_parameter_rejected:'+name)
  assert.equal(args.amountMinor,500)
  assert.equal(args.credits,50)
  const sql=`begin;
  insert into lab.organizations(id,name) values('${org}','Phase4 disposable bridge');
  insert into lab.universities(id,organization_id,name) values('${university}','bridge university');
  insert into lab.projects(id,organization_id,university_id,name) values('${project}','${org}','${university}','bridge project');
  insert into lab.experiments(id,organization_id,project_id,privacy_tier,budget_microcredits) values('${experiment}','${org}','${project}','PRIVATE',1000);
  insert into lab.commercial_credit_rate_versions(rate_version_id,currency_code,denomination,software_service,credits_per_unit,effective_at,approval_ref)
  values('${rate}','USD','test credits','itmounts-lab-software',10,now()-interval '1 hour','ci-bridge-approved-only');
  select set_config('lab.trusted_organization_id','${org}',true);
  select set_config('lab.stripe_test_verification','approved_test_only',true);
  do $bridge$ declare a jsonb; replay jsonb; lot uuid; begin
    a:=lab.testmode_atomic_stripe_settlement('${args.organizationId}','${args.eventId}','${args.paymentIntentId}','${args.accountId}',
     '${args.rateVersionId}',${args.amountMinor},'${args.currency}','${args.payloadSha256}',${args.credits});
    replay:=lab.testmode_atomic_stripe_settlement('${args.organizationId}','${args.eventId}','${args.paymentIntentId}','${args.accountId}',
     '${args.rateVersionId}',${args.amountMinor},'${args.currency}','${args.payloadSha256}',${args.credits});
    if (a->>'replayed')::boolean or not (replay->>'replayed')::boolean then raise exception 'bridge_replay_error'; end if;
    lot:=(a->>'lot_id')::uuid;
    perform lab.testmode_commercial_wallet_event('${org}',lot,'${experiment}','reserve',35,'bridge-reservation-0001');
    perform lab.testmode_commercial_wallet_event('${org}',lot,'${experiment}','capture',30,'usage:bridge-reservation-0001:capture','bridge-reservation-0001');
    perform lab.testmode_commercial_wallet_event('${org}',lot,'${experiment}','release',5,'usage:bridge-reservation-0001:release','bridge-reservation-0001');
    if (select count(*) from lab.commercial_credit_journal where lot_id=lot)<>4 then raise exception 'bridge_journal_count'; end if;
    if (select coalesce(sum(case when operation='reserve' then amount_credits when operation='release' then -amount_credits else 0 end),0)
        from lab.commercial_credit_journal where lot_id=lot)<>30 then raise exception 'bridge_debit_wrong'; end if;
    if not (select internally_consistent from lab.commercial_stripe_evidence_reconciliation where lot_id=lot) then raise exception 'bridge_evidence_wrong'; end if;
  end $bridge$;
  rollback;`
  const out=execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:15000})
  assert.match(out,/ROLLBACK/)
  return {rollbackVerified:true}
 }})
 assert.equal(called,1)
 assert.deepEqual(result,{rollbackVerified:true})
})
test('forged signed event cannot call database executor',async()=>{
 let called=0
 await assert.rejects(stageVerifiedTestSettlement({...input,signatureHeader:'t='+now+',v1='+ '0'.repeat(64),executeTestSettlement:()=>{called++}}))
 assert.equal(called,0)
})
