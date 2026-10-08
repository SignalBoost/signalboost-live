import assert from 'node:assert/strict'
import test from 'node:test'
import { executeLabByoi } from '../lib/ai/cos/itmountsLabByoiExecution.ts'
import type { ScopedProviderRequest,ScopedProviderGrant } from '../lib/ai/cos/itmountsLabByoiScope.ts'
const request: ScopedProviderRequest = { organizationId:'org-a',providerId:'teacher-a',artifactId:'artifact-a',capability:'teacher.invoke',nowMs:100 }
const grant: ScopedProviderGrant = { ...request,secretReference:'vault://tenant-a/teacher',expiresAtMs:200 }
function setup(returned: ScopedProviderGrant | null) {
  const calls: string[] = []
  const host = {
    async loadGrant(r: ScopedProviderRequest) { calls.push('load:'+r.organizationId); return returned },
    async resolveSecret(ref: string) { calls.push('secret:'+ref); return 'private-key' },
    async invokeProvider(i: {credential:string}) { assert.equal(i.credential,'private-key'); calls.push('invoke'); return {receiptId:'provider-receipt'} }
  }
  return { calls,host }
}
test('valid owner-only BYOI dispatch resolves credential after scope and returns only receipt',async()=>{
  const {calls,host}=setup(grant)
  assert.deepEqual(await executeLabByoi(request,host),{receiptId:'provider-receipt'})
  assert.deepEqual(calls,['load:org-a','secret:vault://tenant-a/teacher','invoke'])
})
test('org B cannot invoke org A credential even if grant store returns an A grant',async()=>{
  const {calls,host}=setup(grant)
  await assert.rejects(executeLabByoi({...request,organizationId:'org-b'},host),/lab_byoi_scope_denied/)
  assert.deepEqual(calls,['load:org-b'])
})
test('missing grant, expired grant, mismatched artifact and wrong capability cannot touch vault',async()=>{
  for (const g of [null,{...grant,expiresAtMs:100},{...grant,artifactId:'artifact-b'},{...grant,capability:'tool.invoke' as const}]) {
    const {calls,host}=setup(g)
    await assert.rejects(executeLabByoi(request,host),/lab_byoi_scope_denied/)
    assert.deepEqual(calls,['load:org-a'])
  }
})
