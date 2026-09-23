import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createRunpodBuilderResidencyModelPort,
  type BuilderResidencyModelIdentity,
} from '../platform-harness/residency/exact-artifact-model.ts'

const h=(c:string)=>c.repeat(64)
const r40=(c:string)=>c.repeat(40)

const identity:BuilderResidencyModelIdentity={
  candidateId:'mass:candidate-1:0123456789abcdef',
  artifactId:'cadomos/itmounts-student-test',
  artifactHash:h('a'),
  revisionKey:h('b'),
}

function artifactDb(){
  const reads:string[]=[]
  const db:any={
    from(table:string){
      reads.push(table)
      assert.equal(table,'cos_local_distillation_artifacts')
      return {
        select(){
          return {
            eq(){return this},
            async maybeSingle(){
              return {
                data:{
                  candidate_id:identity.candidateId,
                  subject_id:'Computer Science & Coding',
                  trained_artifact_id:identity.artifactId,
                  trained_artifact_hash:identity.artifactHash,
                  revision_key:identity.revisionKey,
                  evidence_ref:`hf://models/cadomos/itmounts-student-test@${r40('c')}`,
                  status:'evaluation_pending',
                  authority_expanded:false,
                },
                error:null,
              }
            },
          }
        },
      }
    },
  }
  return {db,reads}
}

test('Residency provisions the exact trained artifact without requiring prior canary evidence',async()=>{
  const {db,reads}=artifactDb()
  const calls:any[]=[]
  const provisions:any[]=[]
  const port=createRunpodBuilderResidencyModelPort({
    db,
    apiKey:'secret',
    readyTimeoutMs:1000,
    provisionImpl:async(artifact:any)=>{
      provisions.push(artifact)
      return {
        endpointId:'ep_residency_123',
        endpointName:'residency-endpoint',
        templateName:'residency-template',
        modelName:'itmounts-resident-model',
        baseUrl:'https://ep_residency_123.api.runpod.ai/v1',
        createdTemplate:false,
        createdEndpoint:false,
        reboundTemplate:false,
        workersMin:0,
        workersMax:1,
        idleTimeout:180,
      }
    },
    healthImpl:async()=>({
      ok:true,
      httpStatus:200,
      jobs:{inProgress:0,inQueue:0,failed:0,completed:0},
      workers:{idle:0,ready:1,running:1,initializing:0},
      error:null,
    }),
    fetchImpl:async(url:any,init:any)=>{
      calls.push({url:String(url),init})
      if(String(url).endsWith('/ping')) return new Response('',{status:200})
      return new Response(JSON.stringify({
        choices:[{message:{content:'bounded answer'}}],
      }),{status:200})
    },
  })

  const prepared=await port.prepare!(identity)
  const out=await port.complete({
    identity,
    system:'practice only',
    user:'solve case',
  })

  assert.equal(prepared.exactArtifact,true)
  assert.equal(prepared.endpointId,'ep_residency_123')
  assert.equal(prepared.artifactRevision,r40('c'))
  assert.equal(out.endpointId,'ep_residency_123')
  assert.equal(out.modelId,'itmounts-resident-model')
  assert.equal(out.exactArtifact,true)
  assert.equal(provisions.length,1)
  assert.equal(provisions[0].candidateId,identity.candidateId)
  assert.equal(provisions[0].artifactId,identity.artifactId)
  assert.equal(provisions[0].artifactHash,identity.artifactHash)
  assert.equal(provisions[0].artifactRevision,r40('c'))
  assert.match(provisions[0].runtimeKey,/^[a-f0-9]{10}$/)
  assert.deepEqual([...new Set(reads)],['cos_local_distillation_artifacts'])
  assert.equal(calls.filter(item=>item.url.endsWith('/ping')).length,1)
  const chat=calls.find(item=>item.url.endsWith('/v1/chat/completions'))
  assert.ok(chat)
  const body=JSON.parse(chat.init.body)
  assert.equal(body.model,'itmounts-resident-model')
  assert.equal(body.chat_template_kwargs.enable_thinking,false)
})

test('Residency runtime preparation fails closed on artifact-registry identity drift',async()=>{
  const {db}=artifactDb()
  const bad={...identity,artifactId:'cadomos/wrong-artifact'}
  const port=createRunpodBuilderResidencyModelPort({
    db,
    apiKey:'secret',
    provisionImpl:async()=>{throw new Error('must_not_provision')},
    healthImpl:async()=>{throw new Error('must_not_probe')},
    fetchImpl:async()=>{throw new Error('must_not_fetch')},
  })
  await assert.rejects(
    ()=>port.prepare!(bad),
    /residency_exact_artifact_registry_mismatch/,
  )
})

test('Residency runtime preparation classifies unavailable provider readiness as infrastructure',async()=>{
  const {db}=artifactDb()
  let healthCalls=0
  const port=createRunpodBuilderResidencyModelPort({
    db,
    apiKey:'secret',
    readyTimeoutMs:2,
    provisionImpl:async()=>({
      endpointId:'ep_residency_123',
      endpointName:'residency-endpoint',
      templateName:'residency-template',
      modelName:'itmounts-resident-model',
      baseUrl:'https://ep_residency_123.api.runpod.ai/v1',
      createdTemplate:false,
      createdEndpoint:false,
      reboundTemplate:false,
      workersMin:0,
      workersMax:1,
      idleTimeout:180,
    }),
    healthImpl:async()=>{
      healthCalls+=1
      return {
        ok:true,
        httpStatus:200,
        jobs:{inProgress:0,inQueue:0,failed:0,completed:0},
        workers:{idle:0,ready:0,running:0,initializing:1},
        error:null,
      }
    },
    sleepImpl:async()=>{},
    fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError')},
  })
  await assert.rejects(
    ()=>port.prepare!(identity),
    /residency_exact_artifact_runtime_not_ready/,
  )
  assert.ok(healthCalls>=1)
})
