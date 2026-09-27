// saas/agent-gateway-host/builder-residency-runtime-recovery.ts
import type { AgentRequest, AllowlistEntry } from '../agent-gateway/index.ts'
import type { ChainAttempt, ChainExecutor } from './execution-chain.ts'
import {
  MASS_DISTILLED_RESIDENCY_IDLE_TIMEOUT_SECONDS,
  massDistilledRuntimeHealth,
  reconcileExistingMassDistilledRuntime,
  type MassDistilledRuntimeArtifact,
} from '../lib/ai/cos/runpodMassDistilledProvisionV2.ts'
import { builderResidencyRuntimeKey } from '../lib/ai/cos/cosUniversityGraduateEndpointProtection.ts'

export const BUILDER_RESIDENCY_RUNTIME_RECOVERY_KIND='supervisor_repair'
export const BUILDER_RESIDENCY_RUNTIME_RECOVERY_TARGET='university.repair_builder_residency_runtime'

export const BUILDER_RESIDENCY_RUNTIME_RECOVERY_ALLOWLIST_ENTRY:AllowlistEntry=Object.freeze({
  actionKind:BUILDER_RESIDENCY_RUNTIME_RECOVERY_KIND,
  target:BUILDER_RESIDENCY_RUNTIME_RECOVERY_TARGET,
  rollback:'restore no new resources; leave the exact endpoint scale-to-zero and stop later Residency retries if verification still fails',
})

const HEX64=/^[a-f0-9]{64}$/
const HEX40=/^[a-f0-9]{40}$/
const RECOVERABLE=[
  /^residency_exact_artifact_runtime_not_ready(?::.*)?$/,
  /^residency_exact_artifact_inference_timeout$/,
  /^RunPod GET \/serverless HTTP 5\d\d: failed to list endpoints$/,
  /^mass_distilled_runtime_worker_quota_full(?::.*)?$/,
  /^mass_distilled_runtime_endpoint_worker_policy_drift$/,
  /^mass_distilled_runtime_endpoint_gpu_pool_drift$/,
  /^mass_distilled_runtime_endpoint_gpu_count_drift$/,
  /^mass_distilled_runtime_capacity_restore_(?:missing|rejected)$/,
  /^mass_distilled_runtime_24gb_pool_unavailable$/,
  /^mass_distilled_runtime_endpoint_template_(?:mismatch|rebind_failed)$/,
  /^mass_distilled_runtime_materialized_identity_mismatch$/,
] as const

export function isBuilderResidencyRuntimeRecoverableFailureCode(value:unknown):boolean{
  const code=String(value??'').trim().slice(0,500)
  if(!code) return false
  if(/(?:401|403|auth|token|secret|key_missing|identity_invalid|registry_|hf_revision)/i.test(code)) return false
  return RECOVERABLE.some(pattern=>pattern.test(code))
}

type ArtifactRow=Readonly<{
  candidate_id:string
  subject_id:string
  trained_artifact_id:string
  trained_artifact_hash:string
  revision_key:string
  evidence_ref:string
  status:string
  authority_expanded:boolean
}>

function hfRevision(evidenceRef:unknown):string{
  const match=/^hf:\/\/models\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@([a-f0-9]{40})$/i
    .exec(String(evidenceRef??'').trim())
  return match?.[1]?.toLowerCase()??''
}

function residencyRuntimeKey(candidateId:string,artifactHash:string):string{
  const key=builderResidencyRuntimeKey(candidateId,artifactHash)
  if(!key) throw new Error('residency_runtime_recovery_identity_invalid')
  return key
}

export interface BuilderResidencyRuntimeRecoveryResult{
  candidateId:string
  artifactHash:string
  failureCode:string
  endpointId:string
  endpointName:string
  modelName:string
  reboundTemplate:boolean
  workersMin:number
  workersMax:number
  idleTimeout:number
  providerHealthObserved:boolean
  workersReady:number
  computeWakeAuthorized:false
  modelInvocationAuthorized:false
  productionTrafficAuthorized:false
  automaticPromotionAuthorized:false
  authorityExpanded:false
}

/**
 * Repair only an existing exact-artifact Residency runtime.
 *
 * Artifact identity is re-read from the service-role database. Caller-provided endpoint/template
 * ids are never accepted. The underlying reconciler fails closed if the exact provider resources
 * do not already exist.
 */
export async function recoverBuilderResidencyRuntime(input:{
  db:any
  candidateId:string
  artifactHash:string
  failureCode:string
  reconcile?:typeof reconcileExistingMassDistilledRuntime
  health?:typeof massDistilledRuntimeHealth
}):Promise<BuilderResidencyRuntimeRecoveryResult>{
  const candidateId=String(input.candidateId??'').trim()
  const artifactHash=String(input.artifactHash??'').trim().toLowerCase()
  const failureCode=String(input.failureCode??'').trim().slice(0,500)
  if(!candidateId.startsWith('mass:')||!HEX64.test(artifactHash)){
    throw new Error('residency_runtime_recovery_identity_invalid')
  }
  if(!isBuilderResidencyRuntimeRecoverableFailureCode(failureCode)){
    throw new Error('residency_runtime_recovery_failure_not_preauthorized')
  }

  const result=await input.db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,revision_key,evidence_ref,status,authority_expanded')
    .eq('candidate_id',candidateId)
    .eq('trained_artifact_hash',artifactHash)
    .maybeSingle()
  if(result.error) throw result.error
  const row=result.data as ArtifactRow|null
  if(!row) throw new Error('residency_runtime_recovery_artifact_missing')
  const artifactId=String(row.trained_artifact_id??'').trim()
  const revisionKey=String(row.revision_key??'').trim().toLowerCase()
  const artifactRevision=hfRevision(row.evidence_ref)
  if(
    String(row.subject_id)!=='Computer Science & Coding'
    || String(row.status)!=='evaluation_pending'
    || row.authority_expanded===true
    || String(row.candidate_id)!==candidateId
    || String(row.trained_artifact_hash).toLowerCase()!==artifactHash
    || !artifactId
    || !HEX64.test(revisionKey)
    || !HEX40.test(artifactRevision)
  ){
    throw new Error('residency_runtime_recovery_artifact_not_eligible')
  }

  const artifact:MassDistilledRuntimeArtifact=Object.freeze({
    candidateId,
    subjectId:String(row.subject_id),
    artifactId,
    artifactRevision,
    artifactHash,
    runtimeKey:residencyRuntimeKey(candidateId,artifactHash),
    idleTimeoutSeconds:MASS_DISTILLED_RESIDENCY_IDLE_TIMEOUT_SECONDS,
  })
  const reconcile=input.reconcile??reconcileExistingMassDistilledRuntime
  const repaired=await reconcile(artifact)

  let providerHealthObserved=false
  let workersReady=0
  try{
    const health=await (input.health??massDistilledRuntimeHealth)(repaired.endpointId)
    providerHealthObserved=health.ok===true
    workersReady=Math.max(0,Number(health.workers?.ready??0))
  }catch{
    // Health is evidence only. The next governed Residency attempt owns compute wake/readiness.
  }

  return Object.freeze({
    candidateId,
    artifactHash,
    failureCode,
    endpointId:repaired.endpointId,
    endpointName:repaired.endpointName,
    modelName:repaired.modelName,
    reboundTemplate:repaired.reboundTemplate,
    workersMin:repaired.workersMin,
    workersMax:repaired.workersMax,
    idleTimeout:repaired.idleTimeout,
    providerHealthObserved,
    workersReady,
    computeWakeAuthorized:false,
    modelInvocationAuthorized:false,
    productionTrafficAuthorized:false,
    automaticPromotionAuthorized:false,
    authorityExpanded:false,
  })
}

export function createBuilderResidencyRuntimeRecoveryExecutor(input:{
  db:any|(()=>any)
  recover?:typeof recoverBuilderResidencyRuntime
  id?:string
}):ChainExecutor{
  return {
    id:input.id??'builder-residency-runtime-recovery',
    async attempt(request:AgentRequest):Promise<ChainAttempt>{
      if(request.action.kind!==BUILDER_RESIDENCY_RUNTIME_RECOVERY_KIND){
        return {handled:false,reason:'not a supervisor repair action'}
      }
      if(request.action.target!==BUILDER_RESIDENCY_RUNTIME_RECOVERY_TARGET){
        return {handled:false,reason:'no Builder Residency runtime recovery mapping'}
      }
      const candidateId=String(request.action.params?.candidateId??'').trim()
      const artifactHash=String(request.action.params?.artifactHash??'').trim().toLowerCase()
      const failureCode=String(request.action.params?.failureCode??'').trim().slice(0,500)
      try{
        const db=typeof input.db==='function'?input.db():input.db
        const result=await (input.recover??recoverBuilderResidencyRuntime)({
          db,candidateId,artifactHash,failureCode,
        })
        return {handled:true,ok:true,result}
      }catch(error){
        return {
          handled:true,
          ok:false,
          error:error instanceof Error?error.message:'Builder Residency runtime recovery failed',
        }
      }
    },
  }
}
