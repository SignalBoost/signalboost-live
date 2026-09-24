// saas/platform-harness/acceptance/production-canary.ts
//
// Deployment-bound Production acceptance for the shared Platform Harness.
// This uses only a dedicated service-role scratch table plus the existing immutable
// supervisor audit sink. No customer/business data is read or mutated.

import { randomUUID } from 'node:crypto'
import type { GovernancePolicy, GatewayHost } from '../../agent-gateway/types.ts'
import { createProductionHarnessRequest, runProductionHarnessEnvelope } from '../adapters/production.ts'
import type { HarnessAuthorityEnvelope, HarnessCapabilityGrant, HarnessManifest } from '../core/types.ts'
import { createSupervisorAuditHarnessEvidenceSink } from '../evidence/supervisor-audit-sink.ts'
import { createGovernedHarnessExecutor } from '../runtime/governed-executor.ts'
import type { HarnessCapabilityResolverPort } from '../capabilities/resolver.ts'
import {
  createPortableCapabilityDescriptor,
  type PortableCapabilityDescriptor,
} from '../../provider-hub-core/capability-runtime.ts'

const SCRATCH = 'platform_harness_acceptance_scratch'

export const PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_VERSION =
  'platform-harness-production-acceptance-v1' as const

export const PLATFORM_HARNESS_PRODUCTION_ACCEPTANCE_EVENT =
  'platform_harness_production_acceptance_completed' as const

type DbResult<T=unknown> = { data?:T|null; error?:{message?:string}|null; count?:number|null }
type Db = {
  from(table:string): any
}

type CaseEvidence = Readonly<{
  caseId:string
  runId:string
  outcomeStatus:string
  failureCode:string|null
  route:string
  productionMutationObserved:boolean
  compensationStatus:string|null
  parentRunId:string|null
}>

function capability(
  id:string,
  input:{mutating?:boolean;risk?:'read'|'write'|'consequential'}={},
):HarnessCapabilityGrant {
  const mutating=input.mutating===true
  return Object.freeze({
    id,
    environments:Object.freeze(['production'] as const),
    mutating,
    risk:input.risk ?? (mutating?'write':'read'),
  })
}

function authority(
  runId:string,
  capabilities:readonly HarnessCapabilityGrant[],
  limits:HarnessAuthorityEnvelope['limits'],
):HarnessAuthorityEnvelope {
  return Object.freeze({
    manifestRef:`host://platform-harness-production-acceptance/${runId}`,
    verified:true,
    verifiedBy:'host',
    environments:Object.freeze(['production'] as const),
    capabilities:Object.freeze([...capabilities]),
    limits:Object.freeze({...limits}),
  })
}

/** Native acceptance resolver: binds each granted capability to a real descriptor for this exact run. */
function resolver():HarnessCapabilityResolverPort {
  return Object.freeze({
    async resolve(manifest:HarnessManifest) {
      const resolved:Record<string,PortableCapabilityDescriptor>={}
      for(const grant of manifest.capabilities){
        const risk=grant.risk ?? (grant.mutating?'write':'read')
        resolved[grant.id]=createPortableCapabilityDescriptor({
          capabilityId:grant.id,
          providerId:'native-harness-acceptance',
          connectionId:'platform-harness-acceptance-scratch',
          tenantId:manifest.identity.tenantId ?? 'itmounts',
          environmentId:manifest.environment.environmentId,
          risk,
          availability:'available',
          requiresApproval:risk==='consequential',
          scopes:[...(grant.scopes ?? [])],
        })
      }
      return Object.freeze({
        satisfied:true,
        resolved:Object.freeze(resolved),
        missing:Object.freeze([] as string[]),
      })
    },
  })
}

function evidence(caseId:string,runId:string,suffix:string):string {
  return `harness-acceptance://${caseId}/${runId}/${suffix}`
}

function gatewayPolicy():GovernancePolicy {
  const targets=[
    'harness.acceptance.read',
    'harness.acceptance.write',
    'harness.acceptance.consequential',
    'harness.acceptance.delegate',
    'harness.acceptance.deadline',
    'harness.acceptance.concurrency',
    'harness.acceptance.cost',
  ]
  return Object.freeze({
    classifier:Object.freeze({classify(){return 'reversible_internal' as const}}),
    allowlist:Object.freeze(targets.flatMap(target=>[
      Object.freeze({actionKind:'read',target,rollback:'acceptance-scratch/noop'}),
      Object.freeze({actionKind:'write',target,rollback:'acceptance-scratch/delete'}),
      Object.freeze({actionKind:'delegate',target,rollback:'acceptance-child-owned'}),
    ])),
    tenantId:'itmounts',
    environment:'production',
  })
}

function abortableDelay(ms:number,signal?:AbortSignal):Promise<void> {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(resolve,ms)
    const onAbort=()=>{
      clearTimeout(timer)
      reject(new Error('governed_execution_aborted'))
    }
    if(signal?.aborted) return onAbort()
    signal?.addEventListener('abort',onAbort,{once:true})
  })
}

function gatewayHost(db:Db):GatewayHost {
  return Object.freeze({
    execution:Object.freeze({
      async perform(request:any,control:any) {
        const target=String(request?.action?.target??'')
        const params=request?.action?.params??{}
        const runId=String(params?._harness?.runId??request?.requestId??'unknown')
        if(target==='harness.acceptance.read') {
          const result:DbResult=await db.from(SCRATCH).select('scratch_key',{count:'exact',head:true})
          if(result.error) return {ok:false,error:'harness_acceptance_read_failed'}
          return {
            ok:true,
            result:{count:Number(result.count??0)},
            evidenceRefs:[evidence('read',runId,'database-read')],
          }
        }
        if(target==='harness.acceptance.write'||target==='harness.acceptance.consequential') {
          const scratchKey=String(params.scratchKey??'')
          const value=String(params.value??'')
          if(!scratchKey||!value) return {ok:false,error:'harness_acceptance_write_input_invalid'}
          const result:DbResult=await db.from(SCRATCH).upsert({
            scratch_key:scratchKey,
            run_id:runId,
            value,
            updated_at:new Date().toISOString(),
          },{onConflict:'scratch_key'})
          if(result.error) return {ok:false,error:'harness_acceptance_write_failed'}
          return {
            ok:true,
            result:{scratchKey},
            evidenceRefs:[evidence(target.endsWith('consequential')?'consequential':'write',runId,'database-write')],
          }
        }
        if(target==='harness.acceptance.delegate') {
          return {ok:true,result:{delegated:true},evidenceRefs:[evidence('delegation',runId,'governed-child-action')]}
        }
        if(target==='harness.acceptance.deadline') {
          try {
            await abortableDelay(1_000,control?.signal)
            return {ok:true,result:{completed:true},evidenceRefs:[evidence('deadline',runId,'late-completion')]}
          } catch {
            return {ok:false,error:'governed_execution_aborted'}
          }
        }
        if(target==='harness.acceptance.concurrency') {
          await abortableDelay(150,control?.signal)
          return {ok:true,result:{completed:true},evidenceRefs:[evidence('concurrency',runId,'bounded-call')]}
        }
        if(target==='harness.acceptance.cost') {
          return {ok:true,result:{completed:true},evidenceRefs:[evidence('cost',runId,'unexpected-execution')]}
        }
        return {ok:false,error:'harness_acceptance_unknown_target'}
      },
    }),
  })
}

async function deleteScratch(db:Db,scratchKey:string,caseId:string,runId:string) {
  const result:DbResult=await db.from(SCRATCH).delete().eq('scratch_key',scratchKey)
  if(result.error) return {ok:false,error:'harness_acceptance_compensation_delete_failed'}
  return {ok:true,evidenceRefs:[evidence(caseId,runId,'compensated-delete')]}
}

async function scratchExists(db:Db,scratchKey:string):Promise<boolean> {
  const result:DbResult<any[]>=await db.from(SCRATCH).select('scratch_key').eq('scratch_key',scratchKey).limit(1)
  if(result.error) throw new Error('harness_acceptance_scratch_verify_failed')
  return Array.isArray(result.data)&&result.data.length>0
}

function capture(caseId:string,envelope:any):CaseEvidence {
  if(!envelope?.accepted) throw new Error(`platform_harness_acceptance_${caseId}_not_accepted`)
  const record=envelope.completed.evidence
  return Object.freeze({
    caseId,
    runId:record.runId,
    outcomeStatus:String(record.outcomeStatus),
    failureCode:record.failureCode?String(record.failureCode):null,
    route:String(envelope.completed.route.destination),
    productionMutationObserved:record.productionMutationObserved===true,
    compensationStatus:record.compensationStatus?String(record.compensationStatus):null,
    parentRunId:record.parentRunId?String(record.parentRunId):null,
  })
}

function verified(caseId:string,runId:string) {
  return Object.freeze({
    async verify(){
      return Object.freeze({
        verified:true,
        verifierRef:`verifier://platform-harness-production-acceptance/${caseId}`,
        evidenceRefs:Object.freeze([evidence(caseId,runId,'independent-verification')]),
      })
    },
  })
}

export async function runPlatformHarnessProductionAcceptance(input:{
  db:Db
  productionCommit:string
  productionDeploymentFingerprint:string
}):Promise<Readonly<{
  runId:string
  acceptedAt:string
  productionCommit:string
  productionDeploymentFingerprint:string
  cases:readonly CaseEvidence[]
}>> {
  const db=input.db
  const suiteRunId=`platform-harness-production-acceptance:${randomUUID()}`
  const sink=createSupervisorAuditHarnessEvidenceSink(db as any)
  const capabilities=resolver()
  const executor=createGovernedHarnessExecutor({policy:gatewayPolicy(),host:gatewayHost(db)})
  const cases:CaseEvidence[]=[]

  // 1. Real Production read through the Governed Socket.
  {
    const runId=`${suiteRunId}:read`
    const cap=capability('harness.acceptance.read')
    const envelope=await runProductionHarnessEnvelope({
      request:createProductionHarnessRequest({
        runId,objective:'Production Harness acceptance: bounded read',tenantId:'itmounts',
        portableId:'cos',agentId:'cos-production-acceptance',role:'chief_of_staff',
        environmentId:'itmounts-production',requestedCapabilities:[cap.id],
        limits:{maxToolCalls:1,maxConcurrency:1,deadlineMs:10_000},
      }),
      authority:authority(runId,[cap],{maxToolCalls:1,maxConcurrency:1,deadlineMs:10_000}),
      capabilities,executor,
      worker:{async run(ctx){await ctx.execute({actionId:'read',kind:'read',capabilityId:cap.id})}},
      verifier:verified('read',runId),evidenceSink:sink,
    })
    const captured=capture('read',envelope)
    if(captured.outcomeStatus!=='success') throw new Error('platform_harness_acceptance_read_failed')
    cases.push(captured)
  }

  // 2. Real reversible Production write. The retained row is acceptance evidence, not customer data.
  {
    const runId=`${suiteRunId}:write`
    const scratchKey=`write:${randomUUID()}`
    const cap=capability('harness.acceptance.write',{mutating:true,risk:'write'})
    const envelope=await runProductionHarnessEnvelope({
      request:createProductionHarnessRequest({
        runId,objective:'Production Harness acceptance: reversible write',tenantId:'itmounts',
        portableId:'cos-software-specialist',agentId:'software-specialist-acceptance',role:'software_specialist',
        environmentId:'itmounts-production',requestedCapabilities:[cap.id],
        limits:{maxToolCalls:1,maxConcurrency:1,deadlineMs:10_000},
      }),
      authority:authority(runId,[cap],{maxToolCalls:1,maxConcurrency:1,deadlineMs:10_000}),
      capabilities,executor,
      worker:{async run(ctx){await ctx.execute({
        actionId:'write',kind:'write',capabilityId:cap.id,params:{scratchKey,value:'verified-production-write'},
        compensation:{mode:'compensate',compensationId:'delete-write-scratch',run:()=>deleteScratch(db,scratchKey,'write',runId)},
      })}},
      verifier:{
        async verify(){
          const exists=await scratchExists(db,scratchKey)
          return exists
            ? {verified:true,verifierRef:'verifier://platform-harness-production-acceptance/write',evidenceRefs:[evidence('write',runId,'postcondition-row-present')]}
            : {verified:false,verifierRef:'verifier://platform-harness-production-acceptance/write',evidenceRefs:[],reason:'write_postcondition_missing',failureAttribution:'harness' as const}
        },
      },
      evidenceSink:sink,
    })
    const captured=capture('write',envelope)
    if(captured.outcomeStatus!=='success'||captured.productionMutationObserved!==true) {
      throw new Error('platform_harness_acceptance_write_failed')
    }
    cases.push(captured)
  }

  // 3. Consequential internal canary: precondition evidence + real mutation + forced verification
  // failure must invoke the executable compensation and leave no scratch row behind.
  {
    const runId=`${suiteRunId}:consequential`
    const scratchKey=`consequential:${randomUUID()}`
    const cap=capability('harness.acceptance.consequential',{mutating:true,risk:'consequential'})
    const envelope=await runProductionHarnessEnvelope({
      request:createProductionHarnessRequest({
        runId,objective:'Production Harness acceptance: consequential rollback',tenantId:'itmounts',
        portableId:'cos-software-specialist',agentId:'software-specialist-acceptance',role:'software_specialist',
        environmentId:'itmounts-production',requestedCapabilities:[cap.id],
        limits:{maxToolCalls:1,maxConcurrency:1,deadlineMs:10_000},
      }),
      authority:authority(runId,[cap],{maxToolCalls:1,maxConcurrency:1,deadlineMs:10_000}),
      capabilities,executor,
      worker:{async run(ctx){await ctx.execute({
        actionId:'consequential-write',kind:'write',capabilityId:cap.id,
        params:{scratchKey,value:'must-be-compensated'},
        preconditionEvidenceRefs:[evidence('consequential',runId,'precondition-absent')],
        compensation:{mode:'compensate',compensationId:'delete-consequential-scratch',run:()=>deleteScratch(db,scratchKey,'consequential',runId)},
      })}},
      verifier:{async verify(){return {
        verified:false,
        verifierRef:'verifier://platform-harness-production-acceptance/consequential',
        evidenceRefs:[evidence('consequential',runId,'forced-verification-failure')],
        reason:'acceptance_forced_rollback',
        failureAttribution:'harness' as const,
      }}},
      evidenceSink:sink,
    })
    const captured=capture('consequential',envelope)
    if(
      captured.outcomeStatus!=='harness_failure'||
      captured.productionMutationObserved!==true||
      captured.compensationStatus!=='completed'||
      await scratchExists(db,scratchKey)
    ) throw new Error('platform_harness_acceptance_consequential_rollback_failed')
    cases.push(captured)
  }

  // 4. Real recursive parent -> child Production HarnessRun. Child authority is narrower.
  {
    const parentRunId=`${suiteRunId}:delegate-parent`
    const childRunId=`${suiteRunId}:delegate-child`
    const cap=capability('harness.acceptance.delegate',{mutating:true,risk:'write'})
    let childEvidence:CaseEvidence|null=null
    const parentEnvelope=await runProductionHarnessEnvelope({
      request:createProductionHarnessRequest({
        runId:parentRunId,objective:'Production Harness acceptance: parent delegation',tenantId:'itmounts',
        portableId:'cos',agentId:'cos-production-acceptance',role:'chief_of_staff',
        environmentId:'itmounts-production',requestedCapabilities:[cap.id],
        limits:{maxToolCalls:2,maxConcurrency:1,deadlineMs:15_000},
      }),
      authority:authority(parentRunId,[cap],{maxToolCalls:2,maxConcurrency:1,deadlineMs:15_000}),
      capabilities,executor,
      worker:{async run(parentCtx){
        const childEnvelope=await runProductionHarnessEnvelope({
          request:createProductionHarnessRequest({
            runId:childRunId,objective:'Production Harness acceptance: child delegation',tenantId:'itmounts',
            portableId:'cos-software-specialist',agentId:'software-specialist-acceptance',role:'software_specialist',
            environmentId:'itmounts-production',requestedCapabilities:[cap.id],
            limits:{maxToolCalls:1,maxConcurrency:1,deadlineMs:5_000},
            parent:{runId:parentCtx.manifest.runId,authorityManifestRef:parentCtx.manifest.authorityManifestRef},
          }),
          authority:authority(childRunId,[cap],{maxToolCalls:1,maxConcurrency:1,deadlineMs:5_000}),
          parentManifest:parentCtx.manifest,
          capabilities,executor,
          worker:{async run(ctx){await ctx.execute({
            actionId:'delegated-noop',kind:'delegate',capabilityId:cap.id,
            compensation:{mode:'delegated',reason:'child action owns no durable external effect'},
          })}},
          verifier:verified('delegate-child',childRunId),evidenceSink:sink,
        })
        childEvidence=capture('delegate-child',childEnvelope)
        if(childEvidence.outcomeStatus!=='success'||childEvidence.parentRunId!==parentRunId) {
          throw new Error('platform_harness_acceptance_child_delegation_failed')
        }
        parentCtx.observe({
          summary:'Child HarnessRun completed under narrowed parent authority.',
          evidenceRefs:[evidence('delegate-parent',parentRunId,'child-completed')],
          data:{childRunId},
        })
      }},
      verifier:verified('delegate-parent',parentRunId),evidenceSink:sink,
    })
    const parentEvidence=capture('delegate-parent',parentEnvelope)
    if(parentEvidence.outcomeStatus!=='success'||!childEvidence) {
      throw new Error('platform_harness_acceptance_parent_delegation_failed')
    }
    cases.push(parentEvidence,childEvidence)
  }

  // 5. Wall-clock deadline must abort a real Governed Socket execution.
  {
    const runId=`${suiteRunId}:deadline`
    const cap=capability('harness.acceptance.deadline')
    const envelope=await runProductionHarnessEnvelope({
      request:createProductionHarnessRequest({
        runId,objective:'Production Harness acceptance: deadline abort',tenantId:'itmounts',
        portableId:'cos',agentId:'cos-production-acceptance',role:'chief_of_staff',
        environmentId:'itmounts-production',requestedCapabilities:[cap.id],
        limits:{maxToolCalls:1,maxConcurrency:1,deadlineMs:100},
      }),
      authority:authority(runId,[cap],{maxToolCalls:1,maxConcurrency:1,deadlineMs:100}),
      capabilities,executor,
      worker:{async run(ctx){await ctx.execute({actionId:'slow-read',kind:'read',capabilityId:cap.id})}},
      verifier:verified('deadline',runId),evidenceSink:sink,
    })
    const captured=capture('deadline',envelope)
    if(captured.failureCode!=='harness_deadline_exceeded') throw new Error('platform_harness_acceptance_deadline_failed')
    cases.push(captured)
  }

  // 6. Concurrency ceiling must reject the second overlapping governed execution.
  {
    const runId=`${suiteRunId}:concurrency`
    const cap=capability('harness.acceptance.concurrency')
    const envelope=await runProductionHarnessEnvelope({
      request:createProductionHarnessRequest({
        runId,objective:'Production Harness acceptance: concurrency ceiling',tenantId:'itmounts',
        portableId:'cos',agentId:'cos-production-acceptance',role:'chief_of_staff',
        environmentId:'itmounts-production',requestedCapabilities:[cap.id],
        limits:{maxToolCalls:2,maxConcurrency:1,deadlineMs:5_000},
      }),
      authority:authority(runId,[cap],{maxToolCalls:2,maxConcurrency:1,deadlineMs:5_000}),
      capabilities,executor,
      worker:{async run(ctx){
        await Promise.all([
          ctx.execute({actionId:'concurrency-a',kind:'read',capabilityId:cap.id}),
          ctx.execute({actionId:'concurrency-b',kind:'read',capabilityId:cap.id}),
        ])
      }},
      verifier:verified('concurrency',runId),evidenceSink:sink,
    })
    const captured=capture('concurrency',envelope)
    if(captured.failureCode!=='harness_concurrency_limit_exceeded') throw new Error('platform_harness_acceptance_concurrency_failed')
    cases.push(captured)
  }

  // 7. A hard cost ceiling without exact host accounting must fail closed before execution.
  {
    const runId=`${suiteRunId}:cost`
    const cap=capability('harness.acceptance.cost')
    const envelope=await runProductionHarnessEnvelope({
      request:createProductionHarnessRequest({
        runId,objective:'Production Harness acceptance: hard cost ceiling',tenantId:'itmounts',
        portableId:'cos',agentId:'cos-production-acceptance',role:'chief_of_staff',
        environmentId:'itmounts-production',requestedCapabilities:[cap.id],
        limits:{maxToolCalls:1,maxConcurrency:1,deadlineMs:5_000,maxCostUsd:0.01},
      }),
      authority:authority(runId,[cap],{maxToolCalls:1,maxConcurrency:1,deadlineMs:5_000,maxCostUsd:0.01}),
      capabilities,executor,
      worker:{async run(ctx){await ctx.execute({actionId:'cost-read',kind:'read',capabilityId:cap.id})}},
      verifier:verified('cost',runId),evidenceSink:sink,
    })
    const captured=capture('cost',envelope)
    if(captured.failureCode!=='harness_cost_budget_required') throw new Error('platform_harness_acceptance_cost_failed')
    cases.push(captured)
  }

  const acceptedAt=new Date().toISOString()
  return Object.freeze({
    runId:suiteRunId,
    acceptedAt,
    productionCommit:input.productionCommit,
    productionDeploymentFingerprint:input.productionDeploymentFingerprint,
    cases:Object.freeze(cases),
  })
}
