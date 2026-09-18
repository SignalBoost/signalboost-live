// saas/app/api/cron/runpod-mass-distilled-local-deploy/route.ts
// Exact-artifact bounded canary for mass-distilled students.
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import { decideMassCanaryRollingApproval, type CanaryEvent } from '@/lib/ai/cos/cosUniversityMassCanaryRollingAuthority'
import { recordCosLaneStatus } from '@/lib/ai/cos/cosLaneStatus'
import { describeThrownValue } from '@/lib/ai/cos/describeThrownValue'
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
const RESERVED = 'local_distilled_runtime_canary_started'
const PREFLIGHT_FAILED = 'local_distilled_runtime_canary_preflight_failed'
const INVOCATION_STARTED = 'local_distilled_runtime_canary_invocation_started'
const PASSED = 'local_distilled_runtime_canary_passed'
const FAILED = 'local_distilled_runtime_canary_failed'
const HEX40 = /^[a-f0-9]{40}$/i
const HEX64 = /^[a-f0-9]{64}$/i
const MIN_BALANCE_USD = 1
// Operational status only: never read by a gate. See lib/ai/cos/cosLaneStatus.ts for why this is not
// recorded in the assurance ledger.
const LANE = 'runpod-mass-distilled-local-deploy'
const laneStatus = (outcome:'worked'|'skipped'|'failed',reason:string,detail?:Record<string,unknown>)=>recordCosLaneStatus({db:cosServiceDb(),lane:LANE,outcome,reason,detail})

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

type ActiveClaim = Readonly<{
  artifact: MassDistilledRuntimeArtifact
  revisionKey: string
  approvedCost: number
  approvalAt: string
  reservationEventKey: string
  runtimeKey: string
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
  const evidence={profile:FINE_TUNE_PROFILE,claim:'production_canary_healthy',candidateId:input.candidateId,revisionKey:input.revisionKey,trainedArtifactId:input.artifactId,artifactHash:input.artifactHash,evidenceRef:`db://cos_university_learning_assurance_events/${hash(['mass-distilled-production-canary-v3',input.endpointId,input.responseHash])}`,endpointId:input.endpointId,responseHash:input.responseHash,exactArtifact:true,internalVllmReady:true,scaleToZero:true,productionTrafficAuthorized:false,authorityExpanded:false}
  const evidenceHash=hash(evidence)
  const result=await db.from('cos_university_learning_assurance_events').upsert({event_key:hash([FINE_TUNE_PROFILE,'production_canary_healthy',input.candidateId,input.artifactHash,input.endpointId,input.responseHash]),event_type:'fine_tune',subject_id:input.subjectId,candidate_id:input.candidateId,evidence_hash:evidenceHash,evidence,verifier:'host_production_verifier',observed_at:new Date().toISOString()},{onConflict:'event_key',ignoreDuplicates:true})
  if(result.error) throw result.error
}

function artifactRevision(evidenceRef: unknown){
  const match=/^hf:\/\/models\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@([a-f0-9]{40})$/i.exec(clean(evidenceRef,2000))
  return match?.[1]?.toLowerCase() || ''
}

// Issues at most one bounded canary approval per tick before the unchanged atomic claim.
// Kill switch: COS_MASS_CANARY_ROLLING_AUTHORIZATION=false.
async function issueRollingCanaryApproval(now:Date){
  const db=cosServiceDb(); if(!db) throw new Error('service_database_unavailable')
  const artifacts=await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_hash,created_at')
    .eq('status','evaluation_pending').like('candidate_id','mass:%')
    .order('created_at',{ascending:true}).limit(200)
  if(artifacts.error) throw artifacts.error
  const candidateIds=(artifacts.data||[]).map((row:any)=>String(row.candidate_id))
  if(!candidateIds.length) return {issued:false,reason:'no_evaluation_pending_mass_artifacts'}
  // Include both canary and independent-evaluation events. The rolling policy must know when a
  // passed canary still owns its exact endpoint so the next canary cannot retire it mid-evaluation.
  const events=await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,observed_at,expires_at,verifier,evidence')
    .eq('event_type','fine_tune').in('candidate_id',candidateIds)
    .order('observed_at',{ascending:false}).limit(5000)
  if(events.error) throw events.error
  const decision=decideMassCanaryRollingApproval({
    enabled:process.env.COS_MASS_CANARY_ROLLING_AUTHORIZATION!=='false',
    now,
    artifacts:(artifacts.data||[]).map((row:any)=>({candidateId:String(row.candidate_id),subjectId:String(row.subject_id||''),artifactHash:String(row.trained_artifact_hash||''),createdAt:String(row.created_at||'')})),
    events:(events.data||[]).map((row:any):CanaryEvent=>({candidateId:String(row.candidate_id),observedAt:String(row.observed_at),expiresAt:row.expires_at?String(row.expires_at):null,verifier:String(row.verifier||''),evidence:row.evidence&&typeof row.evidence==='object'?row.evidence:null})),
  })
  if(!('artifact' in decision)) return {issued:false,reason:decision.reason}
  const evidenceHash=hash(decision.evidence)
  const inserted=await db.from('cos_university_learning_assurance_events').insert({
    event_key:hash(['mass-rolling-canary-approval',decision.artifact.candidateId,decision.artifact.artifactHash,now.toISOString()]),
    event_type:'fine_tune',subject_id:decision.artifact.subjectId||null,candidate_id:decision.artifact.candidateId,
    evidence_hash:evidenceHash,evidence:decision.evidence,verifier:'host_controller',
    observed_at:now.toISOString(),expires_at:decision.expiresAt,
  })
  if(inserted.error) throw inserted.error
  return {issued:true,candidateId:decision.artifact.candidateId,artifactHash:decision.artifact.artifactHash}
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

  let active:ActiveClaim|null=null
  let providerInvocationStarted=false
  try{
    // Read-only balance guard comes before the transactional reservation so a low balance consumes no approval.
    const account=await queryRunpodAccountStatus()
    if(account.clientBalance!==null&&account.clientBalance<MIN_BALANCE_USD){await laneStatus('skipped','runpod_balance_guard',{balance:account.clientBalance,minBalanceUsd:MIN_BALANCE_USD});return NextResponse.json({ok:false,error:'runpod_balance_guard',balance:account.clientBalance},{status:402})}

    const rolling=await issueRollingCanaryApproval(new Date(Date.now()-1000))
    console.log('[cos-mass-distilled-rolling-canary-authorization]',JSON.stringify(rolling))
    const claim=await claimNext()
    if(!claim){await laneStatus('skipped','no_atomically_claimable_mass_distilled_artifact',{approvalIssued:Boolean((rolling as any)?.issued),approvalReason:(rolling as any)?.reason});return NextResponse.json({ok:true,skipped:true,reason:'no_atomically_claimable_mass_distilled_artifact',approval:rolling})}
    const {artifact,revisionKey}=artifactFromClaim(claim)
    const approvedCost=Number(claim.max_estimated_canary_cost_usd)
    const approvalAt=String(claim.approval_observed_at||'')
    const reservationEventKey=clean(claim.reservation_event_key,64)
    const runtimeKey=hash(['mass-canary-runtime-v3',artifact.artifactHash,approvalAt]).slice(0,10)
    const runtimeArtifact=Object.freeze({...artifact,runtimeKey})
    active=Object.freeze({artifact:runtimeArtifact,revisionKey,approvedCost,approvalAt,reservationEventKey,runtimeKey})

    // Provisioning is preflight. Provider/API/template drift here may be repaired and retried within
    // the same unexpired approval because no model request or paid endpoint wake has happened yet.
    const provisioned=await provisionMassDistilledRuntime(runtimeArtifact)

    // This durable marker is the exact boundary where the single canary invocation becomes consumed.
    // It is written before /ready, because the first endpoint request can wake paid compute.
    await record({candidateId:runtimeArtifact.candidateId,subjectId:runtimeArtifact.subjectId,artifactHash:runtimeArtifact.artifactHash,claim:INVOCATION_STARTED,evidence:{endpointId:provisioned.endpointId,endpointName:provisioned.endpointName,model:provisioned.modelName,attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:approvedCost,authorizationObservedAt:approvalAt,reservationEventKey,runtimeKey,providerInvocationStarted:true,productionTrafficAuthorized:false,automaticPromotionAuthorized:false}})
    providerInvocationStarted=true

    const canary=await canaryMassDistilledRuntime({endpointId:provisioned.endpointId,modelName:provisioned.modelName})
    let healthAfter:unknown
    try{healthAfter=await massDistilledRuntimeHealth(provisioned.endpointId)}
    catch(error){healthAfter={ok:false,error:error instanceof Error?clean(error.message,300):'mass_distilled_health_read_failed'}}

    if(!canary.ok){
      await record({candidateId:runtimeArtifact.candidateId,subjectId:runtimeArtifact.subjectId,artifactHash:runtimeArtifact.artifactHash,claim:FAILED,evidence:{endpointId:provisioned.endpointId,endpointName:provisioned.endpointName,model:provisioned.modelName,attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:approvedCost,httpStatus:canary.httpStatus,error:clean(canary.error,300),healthAfter,readyTimeoutMs:MASS_DISTILLED_READY_TIMEOUT_MS,canaryTimeoutMs:MASS_DISTILLED_CANARY_TIMEOUT_MS,idleTimeoutSeconds:MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,authorizationObservedAt:approvalAt,reservationEventKey,runtimeKey,providerInvocationStarted:true,productionTrafficAuthorized:false,automaticPromotionAuthorized:false}})
      await laneStatus('failed','canary_failed',{candidateId:runtimeArtifact.candidateId,endpointId:provisioned.endpointId,httpStatus:canary.httpStatus,error:clean(canary.error,300)})
      return NextResponse.json({ok:false,deployed:true,canaryPassed:false,candidateId:runtimeArtifact.candidateId,endpointId:provisioned.endpointId,error:canary.error},{status:503})
    }

    const responseHash=hash(canary.text||'')
    await record({candidateId:runtimeArtifact.candidateId,subjectId:runtimeArtifact.subjectId,artifactHash:runtimeArtifact.artifactHash,claim:PASSED,evidence:{endpointId:provisioned.endpointId,endpointName:provisioned.endpointName,model:provisioned.modelName,httpStatus:canary.httpStatus,responseHash,attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:approvedCost,exactArtifact:true,internalVllmReady:true,scaleToZero:true,authorizationObservedAt:approvalAt,reservationEventKey,runtimeKey,providerInvocationStarted:true,productionTrafficAuthorized:false,automaticPromotionAuthorized:false,healthAfter}})
    await recordFineTuneCanary({candidateId:runtimeArtifact.candidateId,subjectId:runtimeArtifact.subjectId,artifactId:runtimeArtifact.artifactId,artifactHash:runtimeArtifact.artifactHash,revisionKey,endpointId:provisioned.endpointId,responseHash})
    await laneStatus('worked','canary_passed',{candidateId:runtimeArtifact.candidateId,endpointId:provisioned.endpointId,model:provisioned.modelName})
    return NextResponse.json({ok:true,deployed:true,canaryPassed:true,candidateId:runtimeArtifact.candidateId,artifactHash:runtimeArtifact.artifactHash,endpointId:provisioned.endpointId,model:provisioned.modelName,productionTrafficAuthorized:false})
  }catch(error){
    const message=describeThrownValue(error,300)
    if(active&&!providerInvocationStarted){
      await record({candidateId:active.artifact.candidateId,subjectId:active.artifact.subjectId,artifactHash:active.artifact.artifactHash,claim:PREFLIGHT_FAILED,evidence:{error:clean(message,300),attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:active.approvedCost,authorizationObservedAt:active.approvalAt,reservationEventKey:active.reservationEventKey,runtimeKey:active.runtimeKey,providerInvocationStarted:false,retryableWithinApproval:true,productionTrafficAuthorized:false,automaticPromotionAuthorized:false}}).catch(recordError=>console.error('[runpod-mass-distilled-local-deploy-preflight-record]',JSON.stringify({ok:false,error:clean(recordError instanceof Error?recordError.message:String(recordError),300)})))
    }
    await laneStatus('failed','lane_error',{error:clean(message,300),providerInvocationStarted,candidateId:active?.artifact.candidateId})
    console.error('[runpod-mass-distilled-local-deploy]',JSON.stringify({ok:false,error:clean(message,300),claim:active?RESERVED:null,providerInvocationStarted}))
    return NextResponse.json({ok:false,error:clean(message,300),providerInvocationStarted},{status:500})
  }
}
