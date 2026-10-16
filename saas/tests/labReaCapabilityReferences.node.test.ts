import assert from 'node:assert/strict'
import test from 'node:test'
import {LAB_REA_CAPABILITY_REFERENCES,listLabReaReferences} from '../lib/lab/reaCapabilityReferences.ts'
import {LAB_PROVIDER_CATALOG} from '../lib/ai/cos/labCustomerProviderCatalog.ts'
test('REA references distinguish source-implemented transports from market examples',()=>{
 const connected=new Set(LAB_PROVIDER_CATALOG.filter(x=>x.supports['training.execute']).map(x=>x.kind))
 for(const entry of LAB_REA_CAPABILITY_REFERENCES){
  assert.match(entry.source,/^https:\/\//)
  assert.equal(entry.approvalRequiredForExternalAction,true)
  assert.notEqual(entry.status,'production_verified')
  if(entry.status==='source_implemented'){
   assert.equal(entry.capability,'training')
   assert.ok(connected.has(entry.platform as never))
  }
 }
})
test('reference IDs are unique and filtered inventory stays read-only',()=>{
 assert.equal(new Set(LAB_REA_CAPABILITY_REFERENCES.map(x=>x.id)).size,LAB_REA_CAPABILITY_REFERENCES.length)
 assert.ok(listLabReaReferences('evaluation').every(x=>x.capability==='evaluation'))
 assert.ok(listLabReaReferences('evaluation').every(x=>x.status==='reference_only'))
})
