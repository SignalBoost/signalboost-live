import assert from 'node:assert/strict'
import test from 'node:test'
import { assertCustomerProviderScope } from '../lib/ai/cos/itmountsLabByoiScope.ts'
const grant = { organizationId:'org-a',providerId:'model-provider',secretReference:'vault://org-a/model-key',capability:'teacher.invoke' as const,artifactId:'artifact-a',expiresAtMs:2000 }
const request = { organizationId:'org-a',providerId:'model-provider',capability:'teacher.invoke' as const,artifactId:'artifact-a',nowMs:1000 }
test('the right customer resolves only its opaque secret reference',()=> {
  assert.equal(assertCustomerProviderScope(grant,request),'vault://org-a/model-key')
})
test('tenant B cannot use A provider credentials, even for the same provider',()=> {
  assert.throws(()=>assertCustomerProviderScope(grant,{...request,organizationId:'org-b'}),/lab_byoi_scope_denied/)
})
test('artifact and provider authority cannot be reassigned',()=> {
  assert.throws(()=>assertCustomerProviderScope(grant,{...request,artifactId:'artifact-b'}),/lab_byoi_scope_denied/)
  assert.throws(()=>assertCustomerProviderScope(grant,{...request,providerId:'other'}),/lab_byoi_scope_denied/)
  assert.throws(()=>assertCustomerProviderScope(grant,{...request,capability:'compute.execute'}),/lab_byoi_scope_denied/)
})
test('expired grants and inline plaintext secrets fail closed',()=> {
  assert.throws(()=>assertCustomerProviderScope(grant,{...request,nowMs:2000}),/lab_byoi_scope_denied/)
  assert.throws(()=>assertCustomerProviderScope({...grant,secretReference:'plaintext-secret'},request),/lab_byoi_scope_denied/)
  assert.throws(()=>assertCustomerProviderScope({...grant,secretReference:'vault://org-b/model-key'},request),/lab_byoi_scope_denied/)
})
