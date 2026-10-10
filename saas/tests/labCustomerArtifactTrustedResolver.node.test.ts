import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { retrieveCustomerArtifact, type TrustedArtifactExportServices } from '../lib/ai/cos/labCustomerArtifactTrustedResolver.ts'

const org='11111111-1111-4111-8111-111111111111'
const foreign='33333333-3333-4333-8333-333333333333'
const artifact='22222222-2222-4222-8222-222222222222'
const provider='44444444-4444-4444-8444-444444444444'
const bytes=new TextEncoder().encode('verified model adapter')
const sha256=createHash('sha256').update(bytes).digest('hex')
const req={authenticatedUserId:'user-1',requestedOrganizationId:org,requestedArtifactId:artifact}
function fixture(overrides: Partial<TrustedArtifactExportServices> = {}) {
  const calls:string[]=[]
  const services: TrustedArtifactExportServices={
    activeMember:async()=>{calls.push('membership');return true},
    exportAuthority:async()=>{calls.push('authority');return true},
    readExportObject:async()=>{calls.push('catalog');return {
      organization_id:org,permanent_artifact_id:artifact,provider_connection_id:provider,
      storage_object_key:'private/models/adapter.bin',sha256,byte_length:bytes.length,
    }},
    readPrivateObject:async()=>{calls.push('storage');return bytes},
    ...overrides,
  }
  return {services,calls}
}
test('downloads exact owner bytes without university graduation',async()=>{
  const {services,calls}=fixture()
  const result=await retrieveCustomerArtifact(req,services)
  assert.equal(result.ok,true)
  if(result.ok)assert.deepEqual(result.bytes,bytes)
  assert.deepEqual(calls,['membership','authority','catalog','storage'])
})
test('anonymous request stops before membership and storage',async()=>{
  const {services,calls}=fixture()
  assert.equal((await retrieveCustomerArtifact({...req,authenticatedUserId:null},services)).ok,false)
  assert.deepEqual(calls,[])
})
test('nonmember and revoked authority stop before metadata and storage',async()=>{
  for(const field of ['activeMember','exportAuthority'] as const){
    const {services,calls}=fixture({[field]:async()=>false})
    assert.equal((await retrieveCustomerArtifact(req,services)).ok,false)
    assert.equal(calls.includes('catalog'),false)
    assert.equal(calls.includes('storage'),false)
  }
})
test('foreign owner and incorrect artifact metadata never read bytes',async()=>{
  for(const property of ['organization_id','permanent_artifact_id'] as const){
    const {services,calls}=fixture({readExportObject:async()=>({
      organization_id:org,permanent_artifact_id:artifact,provider_connection_id:provider,
      storage_object_key:'private/model.bin',sha256,byte_length:bytes.length,[property]:foreign,
    })})
    assert.equal((await retrieveCustomerArtifact(req,services)).ok,false)
    assert.equal(calls.includes('storage'),false)
  }
})
test('tampering or mismatched byte count returns no bytes',async()=>{
  const bad=fixture({readPrivateObject:async()=>new Uint8Array(bytes.length)})
  assert.deepEqual(await retrieveCustomerArtifact(req,bad.services),{ok:false,reason:'integrity_failed'})
  const short=fixture({readPrivateObject:async()=>new Uint8Array(1)})
  assert.equal((await retrieveCustomerArtifact(req,short.services)).ok,false)
})
test('invalid storage metadata never reaches storage',async()=>{
  const {services,calls}=fixture({readExportObject:async()=>({
    organization_id:org,permanent_artifact_id:artifact,provider_connection_id:provider,
    storage_object_key:'https://evil.example.com/adapter',sha256,byte_length:bytes.length,
  })})
  assert.equal((await retrieveCustomerArtifact(req,services)).ok,false)
  assert.equal(calls.includes('storage'),false)
})
