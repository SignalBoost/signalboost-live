import assert from 'node:assert/strict'
import test from 'node:test'
import { executeLabByoi } from '../lib/ai/cos/itmountsLabByoiExecution.ts'
import { executeLabEgress } from '../lib/ai/cos/itmountsLabEgressExecution.ts'
import type { LabByoiHost } from '../lib/ai/cos/itmountsLabByoiExecution.ts'
import type { LabEgressHost } from '../lib/ai/cos/itmountsLabEgressExecution.ts'

const tenants=['synthetic-a','synthetic-b'] as const
const credentials=['sandbox-only-secret-a','sandbox-only-secret-b'] as const
test('Phase 3 prelaunch sandbox: separate tenant credentials, no cross-tenant vault access and receipt-only output',async()=>{
 const events:string[]=[]
 for(let i=0;i<2;i++){
  const org=tenants[i],credential=credentials[i]
  const host:LabByoiHost={
   loadGrant:async request=>({ ...request,secretReference:`vault://${org}/sandbox`,expiresAtMs:200 }),
   resolveSecret:async reference=>{assert.equal(reference,`vault://${org}/sandbox`);events.push('vault:'+org);return credential},
   invokeProvider:async input=>{assert.equal(input.request.organizationId,org);assert.equal(input.credential,credential);events.push('provider:'+org);return {receiptId:'sandbox-receipt-'+org}},
  }
  const receipt=await executeLabByoi({organizationId:org,providerId:'sandbox',artifactId:'synthetic-artifact-'+org,capability:'teacher.invoke',nowMs:100},host)
  assert.deepEqual(receipt,{receiptId:'sandbox-receipt-'+org})
  assert.equal(JSON.stringify(receipt).includes(credential),false)
 }
 assert.deepEqual(events,['vault:synthetic-a','provider:synthetic-a','vault:synthetic-b','provider:synthetic-b'])
})
test('Phase 3 prelaunch sandbox: failed provider call does not commit a receipt; safe retry uses the same scoped authority',async()=>{
 const committed:string[]=[]
 let attempts=0
 const request={organizationId:'synthetic-a',providerId:'sandbox',artifactId:'artifact-a',capability:'teacher.invoke' as const,nowMs:100}
 const host:LabByoiHost={
  loadGrant:async scoped=>({...scoped,secretReference:'vault://synthetic-a/sandbox',expiresAtMs:200}),
  resolveSecret:async()=>credentials[0],
  invokeProvider:async()=>{attempts++;if(attempts===1)throw Error('provider unavailable '+credentials[0]);committed.push('receipt-after-recovery');return {receiptId:'receipt-after-recovery'}},
 }
 await assert.rejects(executeLabByoi(request,host),e=>{
  assert.equal((e as Error).message,'lab_byoi_provider_failed')
  assert.equal((e as Error).message.includes(credentials[0]),false)
  return true
 })
 assert.deepEqual(committed,[])
 assert.deepEqual(await executeLabByoi(request,host),{receiptId:'receipt-after-recovery'})
 assert.deepEqual(committed,['receipt-after-recovery'])
 // This fixture checks controlled retry, NOT snapshot restore or external-effect idempotency.
})
test('Phase 3 prelaunch sandbox: grant lookup cannot substitute the vault or provider host callbacks',async()=>{
 let substituted=0,original=0
 const host:LabByoiHost={
  loadGrant:async scoped=>{
   host.resolveSecret=async()=>{substituted++;return 'bad'}
   host.invokeProvider=async()=>{substituted++;return {receiptId:'bad'}}
   return {...scoped,secretReference:'vault://synthetic-a/sandbox',expiresAtMs:200}
  },
  resolveSecret:async()=>credentials[0],
  invokeProvider:async()=>{original++;return {receiptId:'original-receipt'}},
 }
 assert.deepEqual(await executeLabByoi({organizationId:'synthetic-a',providerId:'sandbox',artifactId:'artifact-a',capability:'teacher.invoke',nowMs:100},host),{receiptId:'original-receipt'})
 assert.equal(substituted,0)
 assert.equal(original,1)
})
test('Phase 3 prelaunch privacy: authority callback cannot substitute final outbound egress delivery',async()=>{
 let original=0,substituted=0
 const request={sourceOrganizationId:'synthetic-a',destinationOrganizationId:'synthetic-b',experimentId:'sandbox-experiment',kind:'aggregate_metrics' as const}
 const host:LabEgressHost={
  readTrustedDecision:async scoped=>{
   host.deliver=async()=>{substituted++;return {receiptId:'substituted'}}
   return {experimentId:scoped.experimentId,tier:'AGGREGATE_METRICS',authority:{verifiedByHarness:true,sourceOrganizationId:scoped.sourceOrganizationId,destinationOrganizationId:scoped.destinationOrganizationId,explicitResearchConsent:false,rightsCleared:false,aggregateOnly:true}}
  },
  deliver:async()=>{original++;return {receiptId:'authorized-aggregate'}},
 }
 assert.deepEqual(await executeLabEgress(request,host),{receiptId:'authorized-aggregate'})
 assert.equal(original,1)
 assert.equal(substituted,0)
})
test('Phase 3 prelaunch privacy: raw records, provider credentials and logs never egress to other synthetic tenant',async()=>{
 const kinds=['raw_artifact','model_weights','training_records','provider_credentials','audit_logs'] as const
 let deliveries=0
 for(const kind of kinds){
  const host:LabEgressHost={
   readTrustedDecision:async()=>({experimentId:'sandbox-experiment',tier:'AGGREGATE_METRICS',authority:{verifiedByHarness:true,sourceOrganizationId:tenants[0],destinationOrganizationId:tenants[1],explicitResearchConsent:false,rightsCleared:false,aggregateOnly:true}}),
   deliver:async()=>{deliveries++;return {receiptId:'not-allowed'}},
  }
  await assert.rejects(executeLabEgress({sourceOrganizationId:tenants[0],destinationOrganizationId:tenants[1],experimentId:'sandbox-experiment',kind},host),/lab_egress_denied/)
 }
 assert.equal(deliveries,0)
})
