import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const script='scripts/check-university-commercial-readiness.mjs'
const keys=['approved_pricing','live_stripe_checkout','verified_webhook_delivery',
'atomic_tenant_wallet_grant','duplicate_payment_replay','refund_and_dispute_reconciliation',
'byoi_customer_workflow','production_reconciliation']
function run(content) {
 const dir=mkdtempSync(join(tmpdir(),'university-gate-'))
 try {
  const path=join(dir,'evidence.json')
  writeFileSync(path,JSON.stringify(content))
  return spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,UNIVERSITY_COMMERCIAL_EVIDENCE_FILE:path}})
 } finally {rmSync(dir,{recursive:true,force:true})}
}
test('fails closed on absence of verified commercial evidence',()=>{
 const p=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,UNIVERSITY_COMMERCIAL_EVIDENCE_FILE:''}})
 assert.notEqual(p.status,0)
 assert.notEqual(run({checks:{}}).status,0)
})
test('each missing or failed customer transaction stage prevents launch',()=>{
 const checks=Object.fromEntries(keys.map(k=>[k,{status:'passed',receipt:'https://example.org/evidence',revision:'deadbee'}]))
 assert.equal(run({checks}).status,0)
 for(const key of keys) {
  assert.notEqual(run({checks:{...checks,[key]:{status:'failed'}}}).status,0,key)
 }
})
test('invalid revision and receipt formats fail',()=>{
 const checks=Object.fromEntries(keys.map(k=>[k,{status:'passed',receipt:'https://example.org/evidence',revision:'deadbee'}]))
 assert.notEqual(run({checks:{...checks,live_stripe_checkout:{status:'passed',receipt:'unverified',revision:'deadbee'}}}).status,0)
})
