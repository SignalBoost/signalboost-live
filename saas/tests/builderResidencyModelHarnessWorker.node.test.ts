import assert from 'node:assert/strict'
import test from 'node:test'
import { createBuilderResidencyModelHarnessWorker } from '../platform-harness/residency/model-harness-worker.ts'

test('exact-artifact Residency worker can request only resolved capabilities through context.execute',async()=>{
  const calls:any[]=[];let n=0
  const worker=createBuilderResidencyModelHarnessWorker({candidateId:'c1',model:{async complete(input:any){calls.push(input);n++;return n===1?{text:'<action>{"capabilityId":"repo.read","kind":"inspect","params":{"path":"a.ts"}}</action>',endpointId:'ep',modelId:'model',exactArtifact:true as const}:{text:'<final>verified fixture</final>',endpointId:'ep',modelId:'model',exactArtifact:true as const}}})
  const executed:any[]=[];const observed:any[]=[]
  await worker.run({manifest:{runId:'r',objective:'repair fixture',identity:{agentId:'builder',role:'resident',artifact:{artifactId:'a1',artifactHash:'a'.repeat(64),revision:'b'.repeat(64)}},profile:'residency',environment:{environmentId:'sandbox',class:'sandbox'},capabilities:[],authorityManifestRef:'ref',limits:{},learningFeedbackAllowed:true},capabilities:{'repo.read':{providerId:'p'} as any},execute:async(a:any)=>{executed.push(a);return{actionId:a.actionId,capabilityId:a.capabilityId,status:'executed'}},observe:(o:any)=>{observed.push(o);return{} as any}})
  assert.equal(executed.length,1);assert.equal(executed[0].capabilityId,'repo.read');assert.equal(calls[0].identity.artifactId,'a1');assert.equal(observed.at(-1).data.exactArtifact,true)
})

test('exact-artifact Residency worker fails closed on unresolved model-requested capability',async()=>{
  const worker=createBuilderResidencyModelHarnessWorker({candidateId:'c1',model:{async complete(){return{text:'<action>{"capabilityId":"prod.deploy","kind":"deploy"}</action>',endpointId:'ep',modelId:'model',exactArtifact:true as const}}})
  await assert.rejects(()=>worker.run({manifest:{runId:'r',objective:'x',identity:{agentId:'builder',role:'resident',artifact:{artifactId:'a1',artifactHash:'a'.repeat(64),revision:'b'.repeat(64)}},profile:'residency',environment:{environmentId:'sandbox',class:'sandbox'},capabilities:[],authorityManifestRef:'ref',limits:{},learningFeedbackAllowed:true},capabilities:{'repo.read':{} as any},execute:async()=>{throw new Error('must_not_execute')},observe:()=>({} as any)}),/residency_worker_requested_unresolved_capability/)
})
