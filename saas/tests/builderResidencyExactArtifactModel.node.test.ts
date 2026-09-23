import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunpodBuilderResidencyModelPort } from '../platform-harness/residency/exact-artifact-model.ts'

const h=(c:string)=>c.repeat(64)

test('Residency model port invokes only the canary-proven exact artifact model',async()=>{
  const calls:any[]=[]
  const row={verifier:'host_controller',observed_at:'2026-09-22T12:00:00Z',evidence:{claim:'local_distilled_runtime_canary_passed',exactArtifact:true,candidateId:'candidate-1',artifactHash:h('a'),trainedArtifactId:'artifact-1',revisionKey:h('b'),endpointId:'ep_123',model:`itmounts-mass-distilled-${h('a').slice(0,12)}-runtime1`}}
  const db:any={from(){return{select(){return{eq(){return this},contains(){return this},order(){return this},async limit(){return{data:[row],error:null}}}}}}}
  const port=createRunpodBuilderResidencyModelPort({db,apiKey:'secret',fetchImpl:async(url:any,init:any)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({choices:[{message:{content:'bounded answer'}}]}),{status:200})}})
  const out=await port.complete({identity:{candidateId:'candidate-1',artifactId:'artifact-1',artifactHash:h('a'),revisionKey:h('b')},system:'practice only',user:'solve case'})
  assert.equal(out.exactArtifact,true)
  assert.equal(out.endpointId,'ep_123')
  assert.equal(calls.length,1)
  assert.equal(calls[0].body.model,row.evidence.model)
  assert.equal(calls[0].body.chat_template_kwargs.enable_thinking,false)
})

test('Residency model port fails closed without exact canary evidence',async()=>{
  const db:any={from(){return{select(){return{eq(){return this},contains(){return this},order(){return this},async limit(){return{data:[],error:null}}}}}}}
  const port=createRunpodBuilderResidencyModelPort({db,apiKey:'secret',fetchImpl:async()=>{throw new Error('must_not_call')}})
  await assert.rejects(()=>port.complete({identity:{candidateId:'candidate-1',artifactId:'artifact-1',artifactHash:h('a'),revisionKey:h('b')},system:'practice',user:'case'}),/residency_exact_canary_serving_identity_missing/)
})
