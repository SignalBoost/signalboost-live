import assert from 'node:assert/strict'
import test from 'node:test'
import { executeLabByoi } from '../lib/ai/cos/itmountsLabByoiExecution.ts'
import type { ScopedProviderRequest,ScopedProviderGrant } from '../lib/ai/cos/itmountsLabByoiScope.ts'
const request: ScopedProviderRequest = { organizationId:'org-a',providerId:'teacher-a',artifactId:'artifact-a',capability:'teacher.invoke',nowMs:100 }
const grant: ScopedProviderGrant = { ...request,secretReference:'vault://org-a/teacher',expiresAtMs:200 }
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
  assert.deepEqual(calls,['load:org-a','secret:vault://org-a/teacher','invoke'])
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

test('forged org A grant pointing to org B secret never reaches vault or provider',async()=>{
  const {calls,host}=setup({...grant,secretReference:'vault://org-b/teacher'})
  await assert.rejects(executeLabByoi(request,host),/lab_byoi_scope_denied/)
  assert.deepEqual(calls,['load:org-a'])
})

test('provider grant lookup cannot mutate the destination tenant or artifact between check and invoke',async()=>{
  const original={...request}
  const received:string[]=[]
  const host={
    async loadGrant(scoped:ScopedProviderRequest){
      received.push('grant:'+scoped.organizationId+':'+scoped.artifactId)
      original.organizationId='org-b'
      original.artifactId='artifact-b'
      try {(scoped as any).organizationId='org-b'}catch{}
      return grant
    },
    async resolveSecret(reference:string){
      assert.equal(reference,'vault://org-a/teacher')
      received.push('vault')
      return 'private-key'
    },
    async invokeProvider({request:scoped}:{request:ScopedProviderRequest}){
      assert.equal(Object.isFrozen(scoped),true)
      assert.equal(scoped.organizationId,'org-a')
      assert.equal(scoped.artifactId,'artifact-a')
      received.push('invoke:'+scoped.organizationId+':'+scoped.artifactId)
      return {receiptId:'safe'}
    },
  }
  assert.deepEqual(await executeLabByoi(original,host),{receiptId:'safe'})
  assert.deepEqual(received,['grant:org-a:artifact-a','vault','invoke:org-a:artifact-a'])
})
