import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentRequest } from '../agent-gateway/index.ts'
import {
  BUILDER_RESIDENCY_RUNTIME_RECOVERY_KIND,
  BUILDER_RESIDENCY_RUNTIME_RECOVERY_TARGET,
  createBuilderResidencyRuntimeRecoveryExecutor,
  isBuilderResidencyRuntimeRecoverableFailureCode,
  recoverBuilderResidencyRuntime,
} from '../agent-gateway-host/builder-residency-runtime-recovery.ts'

const h=(char:string)=>char.repeat(64)
const r=(char:string)=>char.repeat(40)

test('Residency runtime recovery whitelist accepts transient runtime faults and rejects auth/identity faults',()=>{
  assert.equal(
    isBuilderResidencyRuntimeRecoverableFailureCode(
      'residency_exact_artifact_runtime_not_ready:network',
    ),
    true,
  )
  assert.equal(
    isBuilderResidencyRuntimeRecoverableFailureCode(
      'mass_distilled_runtime_worker_quota_full:10/10',
    ),
    true,
  )
  assert.equal(
    isBuilderResidencyRuntimeRecoverableFailureCode(
      'residency_exact_artifact_runtime_wake_http_401',
    ),
    false,
  )
  assert.equal(
    isBuilderResidencyRuntimeRecoverableFailureCode(
      'residency_runpod_key_missing',
    ),
    false,
  )
  assert.equal(
    isBuilderResidencyRuntimeRecoverableFailureCode(
      'residency_exact_artifact_registry_mismatch',
    ),
    false,
  )
})

test('recovery re-reads exact artifact identity and reconciles existing provider resources only',async()=>{
  const calls:any[]=[]
  const db:any={
    from(table:string){
      assert.equal(table,'cos_local_distillation_artifacts')
      return {
        select(){return this},
        eq(){return this},
        async maybeSingle(){
          return {
            data:{
              candidate_id:'mass:test:0123456789abcdef',
              subject_id:'Computer Science & Coding',
              trained_artifact_id:'cadomos/itmounts-student-test',
              trained_artifact_hash:h('a'),
              revision_key:h('b'),
              evidence_ref:`hf://models/cadomos/itmounts-student-test@${r('c')}`,
              status:'evaluation_pending',
              authority_expanded:false,
            },
            error:null,
          }
        },
      }
    },
  }

  const out=await recoverBuilderResidencyRuntime({
    db,
    candidateId:'mass:test:0123456789abcdef',
    artifactHash:h('a'),
    failureCode:'residency_exact_artifact_runtime_not_ready:network',
    reconcile:async artifact=>{
      calls.push(artifact)
      return {
        templateName:'template',
        endpointName:'endpoint',
        modelName:'model',
        endpointId:'endpoint-1',
        createdTemplate:false as const,
        createdEndpoint:false as const,
        reboundTemplate:true,
        workersMin:0,
        workersMax:1,
        idleTimeout:180,
        baseUrl:'https://endpoint-1.api.runpod.ai/v1',
        computeWakeAuthorized:false as const,
        modelInvocationAuthorized:false as const,
        productionTrafficAuthorized:false as const,
        authorityExpanded:false as const,
      }
    },
    health:async()=>({
      ok:true,
      httpStatus:200,
      jobs:{inProgress:0,inQueue:0,failed:0,completed:0},
      workers:{idle:0,ready:0,running:0,initializing:0},
      error:null,
    }),
  })

  assert.equal(calls.length,1)
  assert.equal(calls[0].candidateId,'mass:test:0123456789abcdef')
  assert.equal(calls[0].artifactId,'cadomos/itmounts-student-test')
  assert.equal(calls[0].artifactRevision,r('c'))
  assert.equal(calls[0].artifactHash,h('a'))
  assert.match(calls[0].runtimeKey,/^[a-f0-9]{10}$/)
  assert.equal(out.endpointId,'endpoint-1')
  assert.equal(out.computeWakeAuthorized,false)
  assert.equal(out.modelInvocationAuthorized,false)
  assert.equal(out.productionTrafficAuthorized,false)
  assert.equal(out.authorityExpanded,false)
})

test('recovery refuses missing exact provider resources rather than creating them',async()=>{
  const db:any={
    from(){
      return {
        select(){return this},
        eq(){return this},
        async maybeSingle(){
          return {
            data:{
              candidate_id:'mass:test:0123456789abcdef',
              subject_id:'Computer Science & Coding',
              trained_artifact_id:'cadomos/itmounts-student-test',
              trained_artifact_hash:h('a'),
              revision_key:h('b'),
              evidence_ref:`hf://models/cadomos/itmounts-student-test@${r('c')}`,
              status:'evaluation_pending',
              authority_expanded:false,
            },
            error:null,
          }
        },
      }
    },
  }

  await assert.rejects(
    recoverBuilderResidencyRuntime({
      db,
      candidateId:'mass:test:0123456789abcdef',
      artifactHash:h('a'),
      failureCode:'residency_exact_artifact_runtime_not_ready:network',
      reconcile:async()=>{throw new Error('mass_distilled_runtime_endpoint_id_missing')},
      health:async()=>{throw new Error('must_not_health')},
    }),
    /mass_distilled_runtime_endpoint_id_missing/,
  )
})

test('registered executor accepts only the exact governed repair target',async()=>{
  const recovered:any[]=[]
  const executor=createBuilderResidencyRuntimeRecoveryExecutor({
    db:{},
    recover:async input=>{
      recovered.push(input)
      return {
        candidateId:input.candidateId,
        artifactHash:input.artifactHash,
        failureCode:input.failureCode,
        endpointId:'endpoint-1',
        endpointName:'endpoint',
        modelName:'model',
        reboundTemplate:false,
        workersMin:0,
        workersMax:1,
        idleTimeout:180,
        providerHealthObserved:true,
        workersReady:0,
        computeWakeAuthorized:false,
        modelInvocationAuthorized:false,
        productionTrafficAuthorized:false,
        automaticPromotionAuthorized:false,
        authorityExpanded:false,
      }
    },
  })
  const request:AgentRequest={
    requestId:'repair-1',
    protocol:'itmounts-harness',
    agentId:'cos-native-self-healing',
    action:{
      kind:BUILDER_RESIDENCY_RUNTIME_RECOVERY_KIND,
      target:BUILDER_RESIDENCY_RUNTIME_RECOVERY_TARGET,
      params:{
        candidateId:'mass:test:0123456789abcdef',
        artifactHash:h('a'),
        failureCode:'residency_exact_artifact_runtime_not_ready:network',
      },
    },
  }

  const handled=await executor.attempt(request)
  assert.equal(handled.handled,true)
  assert.equal((handled as any).ok,true)
  assert.equal(recovered.length,1)

  const declined=await executor.attempt({
    ...request,
    action:{...request.action,target:'university.repair_something_else'},
  })
  assert.equal(declined.handled,false)
})
