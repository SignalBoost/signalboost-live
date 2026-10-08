import assert from 'node:assert/strict'
import test from 'node:test'
import { executeLabEgress, type LabEgressHost } from '../lib/ai/cos/itmountsLabEgressExecution.ts'
const request = { sourceOrganizationId:'tenant-a',destinationOrganizationId:'tenant-b',experimentId:'experiment-a',kind:'aggregate_metrics' as const }
const decision = { experimentId:'experiment-a',tier:'AGGREGATE_METRICS' as const,authority:{
 verifiedByHarness:true as const,sourceOrganizationId:'tenant-a',destinationOrganizationId:'tenant-b',
 explicitResearchConsent:false,rightsCleared:false,aggregateOnly:true,
}}
function fakeHost(value: unknown) {
 const called:string[]=[]
 const host:LabEgressHost = {
  async readTrustedDecision(){called.push('decision');return value as any},
  async deliver(){called.push('delivery');return {receiptId:'receipt-a'}},
 }
 return {host,called}
}
test('trusted aggregate data passes after tenant check', async()=>{
 const {host,called}=fakeHost(decision)
 assert.deepEqual(await executeLabEgress(request,host),{receiptId:'receipt-a'})
 assert.deepEqual(called,['decision','delivery'])
})
test('private and unknown tiers never call delivery',async()=>{
 for (const tier of ['PRIVATE','UNKNOWN']) {
  const {host,called}=fakeHost({...decision,tier})
  await assert.rejects(executeLabEgress(request,host),/lab_egress_denied/)
  assert.deepEqual(called,['decision'])
 }
})
test('forged tenant, experiment, and missing consent cannot dispatch',async()=>{
 for (const bad of [
  {...decision,experimentId:'experiment-b'},
  {...decision,authority:{...decision.authority,sourceOrganizationId:'tenant-b'}},
  {...decision,authority:{...decision.authority,destinationOrganizationId:'tenant-c'}},
  {...decision,authority:{...decision.authority,aggregateOnly:false}},
  null,
 ]) {
  const {host,called}=fakeHost(bad)
  await assert.rejects(executeLabEgress(request,host),/lab_egress_denied/)
  assert.deepEqual(called,['decision'])
 }
})
test('raw artifacts, credentials and logs are blocked before delivery',async()=>{
 for (const kind of ['raw_artifact','provider_credentials','audit_logs'] as const){
  const {host,called}=fakeHost(decision)
  await assert.rejects(executeLabEgress({...request,kind},host),/lab_egress_denied/)
  assert.deepEqual(called,['decision'])
 }
})
test('research dispatch requires explicit consent and rights clearance',async()=>{
 const research={...decision,tier:'RESEARCH_OPT_IN' as const}
 for (const authority of [{...research.authority,explicitResearchConsent:false,rightsCleared:true},{...research.authority,explicitResearchConsent:true,rightsCleared:false}]){
  const {host,called}=fakeHost({...research,authority})
  await assert.rejects(executeLabEgress({...request,kind:'research_dataset'},host),/lab_egress_denied/)
  assert.deepEqual(called,['decision'])
 }
 const {host}=fakeHost({...research,authority:{...research.authority,explicitResearchConsent:true,rightsCleared:true}})
 assert.deepEqual(await executeLabEgress({...request,kind:'research_dataset'},host),{receiptId:'receipt-a'})
})
test('source errors and delivery errors are sanitized',async()=>{
 const h=fakeHost(decision)
 h.host.deliver=async()=>{throw new Error('secret-DO-NOT-ECHO')}
 await assert.rejects(executeLabEgress(request,h.host),e=>{assert.equal((e as Error).message,'lab_egress_delivery_failed');return true})
 h.host.readTrustedDecision=async()=>{throw new Error('secret-DO-NOT-ECHO')}
 await assert.rejects(executeLabEgress(request,h.host),e=>{assert.equal((e as Error).message,'lab_egress_authority_unavailable');return true})
})

test('host callback cannot retarget destination after approval',async()=>{
 const mutable={...request}
 const seen:string[]=[]
 const host:LabEgressHost={
  async readTrustedDecision(scoped){
   seen.push('decision:'+scoped.destinationOrganizationId)
   try {(scoped as any).destinationOrganizationId='tenant-evil'}catch{}
   mutable.destinationOrganizationId='tenant-evil'
   return decision
  },
  async deliver(scoped){
   seen.push('delivery:'+scoped.destinationOrganizationId)
   assert.equal(scoped.destinationOrganizationId,'tenant-b')
   assert.equal(Object.isFrozen(scoped),true)
   return {receiptId:'receipt-safe'}
  },
 }
 assert.deepEqual(await executeLabEgress(mutable,host),{receiptId:'receipt-safe'})
 assert.deepEqual(seen,['decision:tenant-b','delivery:tenant-b'])
})
