import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createRunpodBuilderResidencyModelPort,
  type BuilderResidencyModelIdentity,
} from '../platform-harness/residency/exact-artifact-model.ts'
import {
  BUILDER_RESIDENCY_RUNTIME_IDENTITY_VERSION,
  residencyRunpodRuntimeKey,
} from '../lib/ai/cos/cosUniversityGraduateEndpointProtection.ts'

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
      if(String(url).endsWith('/ready')) return new Response(JSON.stringify({ready:true,model:'itmounts-resident-model'}),{status:200})
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
  assert.equal(BUILDER_RESIDENCY_RUNTIME_IDENTITY_VERSION,'builder-residency-runtime-v2')
  assert.equal(
    provisions[0].runtimeKey,
    residencyRunpodRuntimeKey(identity.candidateId,identity.artifactHash),
  )
  assert.equal(provisions[0].idleTimeoutSeconds,720)
  assert.deepEqual([...new Set(reads)],['cos_local_distillation_artifacts'])
  assert.equal(calls.filter(item=>item.url.endsWith('/ping')).length,1)
  assert.equal(calls.filter(item=>item.url.endsWith('/ready')).length,1)
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

test('Residency retries a missed scale-to-zero wake only while RunPod reports zero workers',async()=>{
  const {db}=artifactDb()
  let pingCalls=0
  let healthCalls=0
  const port=createRunpodBuilderResidencyModelPort({
    db,
    apiKey:'secret',
    readyTimeoutMs:1000,
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
      idleTimeout:720,
    }),
    healthImpl:async()=>{
      healthCalls+=1
      if(pingCalls<2){
        return {
          ok:true,
          httpStatus:200,
          jobs:{inProgress:0,inQueue:0,failed:0,completed:0},
          workers:{idle:0,ready:0,running:0,initializing:0},
          error:null,
        }
      }
      return {
        ok:true,
        httpStatus:200,
        jobs:{inProgress:0,inQueue:0,failed:0,completed:0},
        workers:{idle:1,ready:1,running:0,initializing:0},
        error:null,
      }
    },
    sleepImpl:async()=>{},
    fetchImpl:async(url:any)=>{
      const value=String(url)
      if(value.endsWith('/ping')){
        pingCalls+=1
        if(pingCalls===1) throw new DOMException('timeout','TimeoutError')
        return new Response(JSON.stringify({status:'ready'}),{status:200})
      }
      if(value.endsWith('/ready')){
        return new Response(JSON.stringify({
          ready:true,
          model:'itmounts-resident-model',
        }),{status:200})
      }
      throw new Error('unexpected_fetch')
    },
  })

  const prepared=await port.prepare!(identity)
  assert.equal(prepared.exactArtifact,true)
  assert.equal(pingCalls,2)
  assert.ok(healthCalls>=4)
})

test('Residency runtime preparation classifies unavailable provider readiness as infrastructure',async()=>{
  const {db}=artifactDb()
  let healthCalls=0
  const port=createRunpodBuilderResidencyModelPort({
    db,
    apiKey:'secret',
    readyTimeoutMs:50,
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
    /residency_exact_artifact_runtime_not_ready:provider_workers_ready_0_running_0_initializing_1_idle_0_wake_attempts_1/,
  )
  assert.ok(healthCalls>=1)
})



test('Residency accepts exact application readiness while RunPod still reports running but not ready',async()=>{
  const {db}=artifactDb()
  let readyCalls=0
  const port=createRunpodBuilderResidencyModelPort({
    db,
    apiKey:'secret',
    readyTimeoutMs:1000,
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
      idleTimeout:720,
    }),
    healthImpl:async()=>({
      ok:true,
      httpStatus:200,
      jobs:{inProgress:0,inQueue:0,failed:0,completed:0},
      workers:{idle:0,ready:0,running:1,initializing:0},
      error:null,
    }),
    sleepImpl:async()=>{},
    fetchImpl:async(url:any)=>{
      const value=String(url)
      if(value.endsWith('/ping')) return new Response('',{status:204})
      if(value.endsWith('/ready')){
        readyCalls+=1
        return new Response(JSON.stringify({
          ready:true,
          model:'itmounts-resident-model',
        }),{status:200})
      }
      throw new Error('unexpected_fetch')
    },
  })

  const prepared=await port.prepare!(identity)
  assert.equal(prepared.exactArtifact,true)
  assert.equal(readyCalls,1)
})

test('Residency surfaces permanent gateway bootstrap failure from a running RunPod worker',async()=>{
  const {db}=artifactDb()
  const port=createRunpodBuilderResidencyModelPort({
    db,
    apiKey:'secret',
    readyTimeoutMs:1000,
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
      idleTimeout:720,
    }),
    healthImpl:async()=>({
      ok:true,
      httpStatus:200,
      jobs:{inProgress:0,inQueue:0,failed:0,completed:0},
      workers:{idle:0,ready:0,running:1,initializing:0},
      error:null,
    }),
    sleepImpl:async()=>{},
    fetchImpl:async(url:any)=>{
      const value=String(url)
      if(value.endsWith('/ping')) return new Response('',{status:204})
      if(value.endsWith('/ready')){
        return new Response(JSON.stringify({
          detail:'distilled_bootstrap_failed:RuntimeError:vllm_exited_1',
        }),{status:503})
      }
      throw new Error('unexpected_fetch')
    },
  })

  await assert.rejects(
    ()=>port.prepare!(identity),
    /residency_exact_artifact_runtime_not_ready:bootstrap_failed:distilled_bootstrap_failed:RuntimeError:vllm_exited_1/,
  )
})

test('Residency waits for exact application model readiness after provider worker readiness', async () => {
  const {db}=artifactDb()
  let readyCalls=0
  let healthCalls=0
  const port=createRunpodBuilderResidencyModelPort({
    db,
    apiKey:'secret',
    readyTimeoutMs:1000,
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
      idleTimeout:720,
    }),
    healthImpl:async()=>{
      healthCalls+=1
      return {
        ok:true,
        httpStatus:200,
        jobs:{inProgress:0,inQueue:0,failed:0,completed:0},
        workers:{idle:0,ready:1,running:1,initializing:0},
        error:null,
      }
    },
    sleepImpl:async()=>{},
    fetchImpl:async(url:any)=>{
      const value=String(url)
      if(value.endsWith('/ping')) return new Response('',{status:200})
      if(value.endsWith('/ready')){
        readyCalls+=1
        if(readyCalls===1) return new Response('',{status:204})
        return new Response(JSON.stringify({
          ready:true,
          model:'itmounts-resident-model',
        }),{status:200})
      }
      throw new Error('unexpected_fetch')
    },
  })

  const prepared=await port.prepare!(identity)
  assert.equal(prepared.exactArtifact,true)
  assert.ok(healthCalls>=2)
  assert.equal(readyCalls,2)
})

test('Residency rejects application readiness for a different model identity', async () => {
  const {db}=artifactDb()
  const port=createRunpodBuilderResidencyModelPort({
    db,
    apiKey:'secret',
    readyTimeoutMs:25,
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
      idleTimeout:720,
    }),
    healthImpl:async()=>({
      ok:true,
      httpStatus:200,
      jobs:{inProgress:0,inQueue:0,failed:0,completed:0},
      workers:{idle:0,ready:1,running:1,initializing:0},
      error:null,
    }),
    sleepImpl:async()=>{},
    fetchImpl:async(url:any)=>{
      if(String(url).endsWith('/ping')) return new Response('',{status:200})
      if(String(url).endsWith('/ready')) return new Response(JSON.stringify({
        ready:true,
        model:'wrong-model',
      }),{status:200})
      throw new Error('unexpected_fetch')
    },
  })

  await assert.rejects(
    ()=>port.prepare!(identity),
    /residency_exact_artifact_runtime_not_ready:residency_exact_artifact_application_model_not_ready/,
  )
})
