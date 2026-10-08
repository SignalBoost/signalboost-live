import assert from 'node:assert/strict'
import test from 'node:test'
import { createTenantOwnedBirthSource } from '../lib/ai/cos/universityTenantOwnedBirthSource.ts'
const org='11111111-2222-4333-8444-555555555555'
const other='22222222-3333-4444-8555-666666666666'
const id='f2cb6434-a7ac-49ee-88f0-34a94f31a422'
function fixture(opts:{owner?:string|null;artifact?:string;fail?:boolean}={}){
 const calls:string[]=[]
 const db={
  schema:(schema:string)=>({from:(table:string)=>query(schema+'.'+table)}),
  from:(table:string)=>query('public.'+table),
 }
 function query(table:string){
  const filters:Record<string,string>={}
  const q:any={
   select:(columns:string)=>{calls.push(table+':select:'+columns);return q},
   eq:(column:string,value:string)=>{filters[column]=value;return q},
   maybeSingle:async()=>{
    calls.push(table+':read')
    if(opts.fail && table==='lab.artifacts')return {data:null,error:'database error'}
    if(table==='lab.artifacts')return {data:opts.owner===null?null:{
     permanent_artifact_id:opts.artifact??id,organization_id:opts.owner??org},error:null}
    return {data:{permanent_artifact_id:id,issuance_kind:'native_birth',trained_artifact_hash:'a'.repeat(64)},error:null}
   },
  };return q
 }
 return {source:createTenantOwnedBirthSource(db),calls}
}
test('Phase 2: canonical tenant ownership precedes both birth and signed reads',async()=>{
 const f=fixture()
 assert.ok(await f.source.readBirth(org,id))
 assert.ok(await f.source.readSignedEnvelope(org,id))
 assert.deepEqual(f.calls.filter(c=>c.endsWith(':read')),[
  'lab.artifacts:read','public.cos_university_artifact_birth_certificates:read','lab.artifacts:read',
  'lab.artifacts:read','public.cos_university_signed_birth_envelopes:read','lab.artifacts:read'])
})
test('Phase 2: foreign tenant, invalid UUID and absent owner fail before sensitive read',async()=>{
 for(const opts of [{owner:other},{owner:null},{artifact:other},{fail:true}]){
  const f=fixture(opts)
  await assert.rejects(f.source.readBirth(org,id))
  assert.equal(f.calls.some(c=>c.startsWith('public.')),false)
 }
 const f=fixture()
 await assert.rejects(f.source.readSignedEnvelope('tenant-name',id))
 assert.equal(f.calls.length,0)
})
test('Phase 2: each signed read independently rechecks ownership after revocation',async()=>{
 const f=fixture()
 await f.source.readBirth(org,id)
 const revoked=fixture({owner:other})
 await assert.rejects(revoked.source.readSignedEnvelope(org,id))
 assert.equal(revoked.calls.some(c=>c.startsWith('public.')),false)
})
test('Phase 2: reads explicitly restrict columns and do not retrieve model prompts',async()=>{
 const f=fixture()
 await f.source.readBirth(org,id)
 await f.source.readSignedEnvelope(org,id)
 assert.equal(f.calls.some(c=>c.includes(':select:*')),false)
 assert.equal(f.calls.some(c=>/response_text|private_key|prompt_text/.test(c)),false)
})

test('Phase 2: ownership lost during certificate read refuses record release',async()=>{
 const f=fixture()
 let ownershipChecks=0
 const original=f.source
 // Simulate changing canonical owner by wrapping the DB layer in a separate fixture below.
 const calls:string[]=[]
 function query(table:string){const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>{
  calls.push(table)
  if(table==='lab.artifacts')return {error:null,data:{permanent_artifact_id:id,organization_id:++ownershipChecks===1?org:other}}
  return {error:null,data:{permanent_artifact_id:id}}
 }};return q}
 const db={schema:(s:string)=>({from:(t:string)=>query(s+'.'+t)}),from:(t:string)=>query('public.'+t)}
 const source=createTenantOwnedBirthSource(db)
 await assert.rejects(source.readSignedEnvelope(org,id))
 assert.deepEqual(calls,['lab.artifacts','public.cos_university_signed_birth_envelopes','lab.artifacts'])
 assert.ok(original)
})
