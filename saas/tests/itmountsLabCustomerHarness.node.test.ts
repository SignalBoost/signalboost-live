import assert from 'node:assert/strict'
import test from 'node:test'
import { LAB_UNIVERSITY_BIND_CAPABILITY,withCustomerLabUniversityBindingHarness } from '../platform-harness/adapters/lab-customer.ts'
import { currentHarnessExecutionContext } from '../platform-harness/runtime/execution-context.ts'

const ORG='11111111-1111-4111-8111-111111111111'

test('customer Lab ingress binds the authenticated organization into a zero-spend HarnessRun',async()=>{
 let observed:any=null
 const result=await withCustomerLabUniversityBindingHarness({organizationId:ORG,operation:async manifest=>{
  const context=currentHarnessExecutionContext()
  observed={manifest,context}
  return 'ok'
 }})
 assert.equal(result,'ok')
 assert.equal(observed.manifest.identity.tenantId,ORG)
 assert.equal(observed.manifest.profile,'production')
 assert.equal(observed.manifest.capabilities.length,1)
 assert.equal(observed.manifest.capabilities[0].id,LAB_UNIVERSITY_BIND_CAPABILITY)
 assert.deepEqual(observed.manifest.capabilities[0].scopes,[`organization:${ORG}`])
 assert.equal(observed.manifest.limits.maxCostUsd,0)
 assert.equal(observed.manifest.limits.maxConcurrency,1)
 assert.equal(observed.context?.manifest.runId,observed.manifest.runId)
})
