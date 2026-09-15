// Exact-artifact bounded canary for mass-distilled students.
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import {
  MASS_DISTILLED_READY_TIMEOUT_MS,
  MASS_DISTILLED_CANARY_TIMEOUT_MS,
  MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,
  canaryMassDistilledRuntime,
  massDistilledRuntimeHealth,
  provisionMassDistilledRuntime,
  type MassDistilledRuntimeArtifact,
} from '@/lib/ai/cos/runpodMassDistilledProvisionV2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PROFILE = 'cos_local_distilled_runtime_deploy_v1'
const FINE_TUNE_PROFILE = 'cos_university_fine_tune_evidence_v1'
const PASSED = 'local_distilled_runtime_canary_passed'
const FAILED = 'local_distilled_runtime_canary_failed'
const HEX40 = /^[a-f0-9]{40}$/i
const HEX64 = /^[a-f0-9]{64}$/i
const MIN_BALANCE_USD = 1

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clean = (value: unknown, max = 1000) => String(value ?? '').replace(/\s+/g,' ').trim().slice(0,max)

type AtomicClaim = Readonly<{
  candidate_id: string
  subject_id: string
  artifact_id: string
  artifact_hash: string
  revision_key: string
  evidence_ref: string
  approval_observed_at: string
  max_canary_invocations: number
  max_estimated_canary_cost_usd: number
  reservation_event_key: string
}>

async function record(input:{candidateId:string;subjectId:string;artifactHash:string;claim:string;evidence:Record<string,unknown>;verifier?:string}){
  const db=cosServiceDb(); if(!db) throw new Error('service_database_unavailable')
  const body={profile:PROFILE,claim:input.claim,candidateId:input.candidateId,artifactHash:input.artifactHash,...input.evidence,authorityExpanded:false}
  const evidenceHash=hash(body)
  const result=await db.from('cos_university_learning_assurance_events').upsert({event_key:hash([PROFILE,input.claim,input.candidateId,input.artifactHash,evidenceHash]),event_type:'fine_tune',subject_id:input.subjectId,candidate_id:input.candidateId,evidence_hash:evidenceHash,evidence:body,verifier:input.verifier||'host_controller',observed_at:new Date().toISOString()},{onConflict:'event_key',ignoreDuplicates:true})
  if(result.error) throw result.error
}

async function recordFineTuneCanary(input:{candidateId:string;subjectId:string;artifactId:string;artifactHash:string;revisionKey:string;endpointId:string;responseHash:string}){
  const db=cosServiceDb(); if(!db) throw new Error('service_database_unavailable')
  const evidence={profile:FINE_TUNE_PROFILE,claim:'production_canary_healthy',candidateId:input.candidateId,revisionKey:input.revisionKey,trainedArtifactId:input.artifactId,artifactHash:input.artifactHash,evidenceRef:`db://cos_university_learning_assurance_events/${hash(['mass-distilled-production-canary-v2',input.endpointId,input.responseHash])}`,endpointId:input.endpointId,responseHash:input.responseHash,exactArtifact:true,internalVllmReady:true,scaleToZero:true,productionTrafficAuthorized:false,authorityExpanded:false}
  const evidenceHash=hash(evidence)
  const result=await db.from('cos_university_learning_assurance_events').upsert({event_key:hash([FINE_TUNE_PROFILE,'production_canary_healthy',input.candidateId,input.artifactHash,input.endpointId,input.responseHash]),event_type:'fine_tune',subject_id:input.subjectId,candidate_id:input.candidateId,evidence_hash:evidenceHash,evidence,verifier:'host_production_verifier',observed_at:new Date().toISOString()},{onConflict:'event_key',ignoreDuplicates:true})
  if(result.error) throw result.error
}

function artifactRevision(evidenceRef: unknown){
  const match=/^hf:\/\/models\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@([a-f0-9]{40})$/i.exec(clean(evidenceRef,2000))
  return match?.[1]?.toLowerCase() || ''
}

async function claimNext():Promise<AtomicClaim|null>{
  const db=cosServiceDb(); if(!db) throw new Error('service_database_unavailable')
  const result=await db.rpc('claim_next_mass_distilled_runtime_canary')
  if(result.error) throw result.error
  const row=Array.isArray(result.data)?result.data[0] as AtomicClaim|undefined:undefined
  return row||null
}

function artifactFromClaim(claim:AtomicClaim):{artifact:MassDistilledRuntimeArtifact;revisionKey:string}{
  const candidateId=clean(claim.candidate_id,240)
  const subjectId=clean(claim.subject_id,240)
  const artifactId=clean(claim.artifact_id,500)
  const artifactHash=clean(claim.artifact_hash,64).toLowerCase()
  const revisionKey=clean(claim.revision_key,64).toLowerCase()
  const revision=artifactRevision(claim.evidence_ref)
  if(!candidateId.startsWith('mass:')||!subjectId||!artifactId||!HEX64.test(artifactHash)||!HEX64.test(revisionKey)||!HEX40.test(revision)) throw new Error('mass_distilled_atomic_claim_identity_invalid')
  if(Number(claim.max_canary_invocations)!==1) throw new Error('mass_distilled_atomic_claim_invocation_ceiling_invalid')
  const cost=Number(claim.max_estimated_canary_cost_usd)
  if(!Number.isFinite(cost)||cost<=0||cost>0.2) throw new Error('mass_distilled_atomic_claim_cost_ceiling_invalid')
  if(!clean(claim.reservation_event_key,64)) throw new Error('mass_distilled_atomic_claim_reservation_missing')
  return {artifact:Object.freeze({candidateId,subjectId,artifactId,artifactRevision:revision,artifactHash}),revisionKey}
}

export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET
  if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`) return NextResponse.json({ok:false,error:'Unauthorized'},{status:401})
  try{
    // Read-only balance guard comes before the transactional reservation so a low balance consumes no approval.
    const account=await queryRunpodAccountStatus()
    if(account.clientBalance!==null&&account.clientBalance<MIN_BALANCE_USD) return NextResponse.json({ok:false,error:'runpod_balance_guard',balance:account.clientBalance},{status:402})

    const claim=await claimNext()
    if(!claim) return NextResponse.json({ok:true,skipped:true,reason:'no_atomically_claimable_mass_distilled_artifact'})
    const {artifact,revisionKey}=artifactFromClaim(claim)
    const approvedCost=Number(claim.max_estimated_canary_cost_usd)
    const approvalAt=String(claim.approval_observed_at||'')
    const reservationEventKey=clean(claim.reservation_event_key,64)

    const provisioned=await provisionMassDistilledRuntime(artifact)
    const canary=await canaryMassDistilledRuntime({endpointId:provisioned.endpointId,modelName:provisioned.modelName})
    const healthAfter=await massDistilledRuntimeHealth(provisioned.endpointId)

    if(!canary.ok){
      await record({candidateId:artifact.candidateId,subjectId:artifact.subjectId,artifactHash:artifact.artifactHash,claim:FAILED,evidence:{endpointId:provisioned.endpointId,endpointName:provisioned.endpointName,model:provisioned.modelName,attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:approvedCost,httpStatus:canary.httpStatus,error:clean(canary.error,300),healthAfter,readyTimeoutMs:MASS_DISTILLED_READY_TIMEOUT_MS,canaryTimeoutMs:MASS_DISTILLED_CANARY_TIMEOUT_MS,idleTimeoutSeconds:MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,authorizationObservedAt:approvalAt,reservationEventKey,productionTrafficAuthorized:false}})
      return NextResponse.json({ok:false,deployed:true,canaryPassed:false,candidateId:artifact.candidateId,endpointId:provisioned.endpointId,error:canary.error},{status:503})
    }

    const responseHash=hash(canary.text||'')
    await record({candidateId:artifact.candidateId,subjectId:artifact.subjectId,artifactHash:artifact.artifactHash,claim:PASSED,evidence:{endpointId:provisioned.endpointId,endpointName:provisioned.endpointName,model:provisioned.modelName,httpStatus:canary.httpStatus,responseHash,attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:approvedCost,exactArtifact:true,internalVllmReady:true,scaleToZero:true,productionTrafficAuthorized:false,authorizationObservedAt:approvalAt,reservationEventKey,healthAfter}})
    await recordFineTuneCanary({candidateId:artifact.candidateId,subjectId:artifact.subjectId,artifactId:artifact.artifactId,artifactHash:artifact.artifactHash,revisionKey,endpointId:provisioned.endpointId,responseHash})
    return NextResponse.json({ok:true,deployed:true,canaryPassed:true,candidateId:artifact.candidateId,artifactHash:artifact.artifactHash,endpointId:provisioned.endpointId,model:provisioned.modelName,productionTrafficAuthorized:false})
  }catch(error){
    const message=error instanceof Error?error.message:String(error)
    console.error('[runpod-mass-distilled-local-deploy]',JSON.stringify({ok:false,error:clean(message,300)}))
    return NextResponse.json({ok:false,error:clean(message,300)},{status:500})
  }
}