// saas/app/api/cron/runpod-mass-distilled-local-deploy/route.ts
// Exact-artifact bounded canary for mass-distilled students.
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import {
  MASS_CANARY_BUILDER_APPRENTICESHIP_PRIORITY_AFTER,
  MASS_CANARY_BUILDER_V2_OPTIMIZER,
  MASS_CANARY_PROFILE,
  MASS_CANARY_IN_FLIGHT_TTL_MS,
  MASS_CANARY_REMEDIATION_REPLAY_MIN_ITEMS,
  MASS_CANARY_REMEDIATION_REPLAY_MIN_EPOCHS,
  MASS_CANARY_REMEDIATION_REPLAY_MIN_LEARNING_RATE,
  MASS_CANARY_ROLLING_WINDOW_HOURS,
  decideMassCanaryRollingApproval,
  type CanaryEvent,
} from '@/lib/ai/cos/cosUniversityMassCanaryRollingAuthority'
import { recordCosLaneStatus } from '@/lib/ai/cos/cosLaneStatus'
import { describeThrownValue } from '@/lib/ai/cos/describeThrownValue'
import {
  MASS_DISTILLED_READY_TIMEOUT_MS,
  MASS_DISTILLED_CANARY_TIMEOUT_MS,
  MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,
  activateMassDistilledCanaryWorker,
  canaryMassDistilledRuntime,
  deactivateMassDistilledCanaryWorker,
  massDistilledRuntimeHealth,
  provisionMassDistilledCanaryRuntime,
  type MassDistilledRuntimeArtifact,
} from '@/lib/ai/cos/runpodMassDistilledProvisionV2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 450

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
const laneStatus = (outcome:'running'|'worked'|'skipped'|'failed',reason:string,detail?:Record<string,unknown>)=>recordCosLaneStatus({db:cosServiceDb(),lane:LANE,outcome,reason,detail})

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

const ROLLING_EVENT_PROFILES = [
  MASS_CANARY_PROFILE,
  'cos_mass_distilled_independent_evaluation_runtime_v1',
  'cos_distilled_independent_evaluation_authorization_v1',
] as const
const ROLLING_EVENT_PAGE_SIZE = 1000
// PostgREST encodes .in(...) as a URL filter. Production exceeded safe request size once the
// current-recipe priority set grew to 845 pending candidates, yielding generic 400 Bad Request before
// the atomic canary claim ran. Keep the full eligibility set, but bound each candidate filter.
const ROLLING_EVENT_CANDIDATE_CHUNK_SIZE = 75

async function readRollingCanaryEvents(db:any,candidateIds:string[]){
  const rows:any[]=[]
  const uniqueCandidateIds=[...new Set(candidateIds.map(value=>String(value||'').trim()).filter(Boolean))]
  for(const profile of ROLLING_EVENT_PROFILES){
    for(let offset=0;offset<uniqueCandidateIds.length;offset+=ROLLING_EVENT_CANDIDATE_CHUNK_SIZE){
      const candidateChunk=uniqueCandidateIds.slice(offset,offset+ROLLING_EVENT_CANDIDATE_CHUNK_SIZE)
      for(let from=0;;from+=ROLLING_EVENT_PAGE_SIZE){
        const page=await db.from('cos_university_learning_assurance_events')
          .select('candidate_id,observed_at,expires_at,verifier,evidence')
          .eq('event_type','fine_tune').in('candidate_id',candidateChunk)
          .contains('evidence',{profile})
          .order('observed_at',{ascending:false})
          .range(from,from+ROLLING_EVENT_PAGE_SIZE-1)
        if(page.error) throw page.error
        const data=page.data||[]
        rows.push(...data)
        if(data.length<ROLLING_EVENT_PAGE_SIZE) break
      }
    }
  }
  return rows
}

// The rolling hourly spend cap counts EVERY canary invocation in the window, not only invocations of the
// artifacts still queued. readRollingCanaryEvents is scoped to the currently eligible candidates, so a canary
// whose artifact then passed (and left evaluation_pending) or fell outside the oldest-200 window disappeared
// from the count. Production on 2026-09-24 started 5 invocations between 21:46 and 22:40 UTC against a cap of 3.
// This query is candidate-agnostic and bounded by time, so the window count is complete.
const ROLLING_WINDOW_INVOCATION_CLAIM = 'local_distilled_runtime_canary_invocation_started'
async function readRollingWindowInvocations(db:any,now:Date){
  const windowStart=new Date(now.getTime()-MASS_CANARY_ROLLING_WINDOW_HOURS*3600_000).toISOString()
  const page=await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,observed_at,expires_at,verifier,evidence')
    .eq('event_type','fine_tune')
    .eq('verifier','host_controller')
    .contains('evidence',{profile:MASS_CANARY_PROFILE,claim:ROLLING_WINDOW_INVOCATION_CLAIM})
    .gt('observed_at',windowStart)
    .order('observed_at',{ascending:false})
    .limit(ROLLING_EVENT_PAGE_SIZE)
  if(page.error) throw page.error
  return page.data||[]
}

function rollingEventKey(row:any){
  return [String(row?.candidate_id||''),String(row?.observed_at||''),String(row?.verifier||''),String(row?.evidence?.claim||'')].join('|')
}

// Issues at most one bounded canary approval per tick before the unchanged atomic claim.
// Kill switch: COS_MASS_CANARY_ROLLING_AUTHORIZATION=false.
async function issueRollingCanaryApproval(now:Date){
  const db=cosServiceDb(); if(!db) throw new Error('service_database_unavailable')
  // Keep legacy fairness bounded to the oldest 200, but separately include the current anchored recipe
  // across every subject. Production quality telemetry showed the old stable-on-policy cohort at 0 full passes
  // across 122 independently evaluated artifacts; queueing only by age would spend days proving obsolete recipe
  // generations before measuring the recipe that current training actually emits.
  const [oldestArtifacts,currentRecipeArtifacts,v2BuilderArtifacts,replayArtifacts]=await Promise.all([
    db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,trained_artifact_hash,created_at,intended_use')
      .eq('status','evaluation_pending').like('candidate_id','mass:%')
      .order('created_at',{ascending:true}).limit(200),
    db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,trained_artifact_hash,created_at,status,intended_use')
      .eq('status','evaluation_pending')
      .like('candidate_id','mass:%')
      .contains('intended_use',{trainingReceipt:{
        optimizer:MASS_CANARY_BUILDER_V2_OPTIMIZER,
        frontierResponseAnchorRequired:true,
        frontierResponseAnchorEpochs:1,
      }})
      .order('created_at',{ascending:true})
      .limit(500),
    db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,trained_artifact_hash,created_at,status,intended_use')
      .eq('subject_id','Computer Science & Coding')
      .gte('created_at',MASS_CANARY_BUILDER_APPRENTICESHIP_PRIORITY_AFTER)
      .contains('intended_use',{trainingReceipt:{
        optimizer:MASS_CANARY_BUILDER_V2_OPTIMIZER,
        frontierResponseAnchorRequired:true,
        frontierResponseAnchorEpochs:1,
      }})
      .order('created_at',{ascending:true})
      .limit(20),
    // Replay proof must be visible even when the legacy oldest-200 window is full.
    db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,trained_artifact_hash,created_at,status,intended_use')
      .contains('intended_use',{trainingReceipt:{failureDerivedReplayRequired:true}})
      .order('created_at',{ascending:true})
      .limit(50),
  ])
  if(oldestArtifacts.error) throw oldestArtifacts.error
  if(currentRecipeArtifacts.error) throw currentRecipeArtifacts.error
  if(v2BuilderArtifacts.error) throw v2BuilderArtifacts.error
  if(replayArtifacts.error) throw replayArtifacts.error
  const confirmedCurrentRecipeArtifacts=(currentRecipeArtifacts.data||[]).filter((row:any)=>{
    const receipt=row?.intended_use?.trainingReceipt
    return receipt&&typeof receipt==='object'
      && receipt.optimizer===MASS_CANARY_BUILDER_V2_OPTIMIZER
      && receipt.frontierResponseAnchorRequired===true
      && Number(receipt.frontierResponseAnchorEpochs||0)===1
      && Number(receipt.frontierResponseAnchorItems||0)>0
  })
  const confirmedBuilderArtifacts=(v2BuilderArtifacts.data||[]).filter((row:any)=>{
    const receipt=row?.intended_use?.trainingReceipt
    return receipt&&typeof receipt==='object'
      && receipt.optimizer===MASS_CANARY_BUILDER_V2_OPTIMIZER
      && receipt.frontierResponseAnchorRequired===true
      && Number(receipt.frontierResponseAnchorEpochs||0)===1
      && Number(receipt.frontierResponseAnchorItems||0)>0
  })
  const confirmedReplayArtifacts=(replayArtifacts.data||[]).filter((row:any)=>{
    const receipt=row?.intended_use?.trainingReceipt
    return receipt&&typeof receipt==='object'
      && receipt.failureDerivedReplayRequired===true
      && Number(receipt.failureDerivedReplayItems||0)>=MASS_CANARY_REMEDIATION_REPLAY_MIN_ITEMS
      && Number(receipt.failureDerivedReplayEpochs||0)>=MASS_CANARY_REMEDIATION_REPLAY_MIN_EPOCHS
      && Number(receipt.failureDerivedReplayLearningRate||0)>=MASS_CANARY_REMEDIATION_REPLAY_MIN_LEARNING_RATE
  })
  const pendingCurrentRecipeArtifacts=confirmedCurrentRecipeArtifacts.filter((row:any)=>String(row.status||'')==='evaluation_pending')
  const pendingBuilderArtifacts=confirmedBuilderArtifacts.filter((row:any)=>String(row.status||'')==='evaluation_pending')
  const pendingReplayArtifacts=confirmedReplayArtifacts.filter((row:any)=>String(row.status||'')==='evaluation_pending')
  const artifactByCandidate=new Map<string,any>()
  for(const row of [...(oldestArtifacts.data||[]),...pendingCurrentRecipeArtifacts,...pendingBuilderArtifacts,...pendingReplayArtifacts]){
    artifactByCandidate.set(String((row as any).candidate_id),row)
  }
  const artifactRows=[...artifactByCandidate.values()]

  // Computer Science final canary is gated by exact Builder Residency completion in the atomic claim.
  // Keep rolling authorization on the same eligibility set so an unclaimable CS approval cannot hold the
  // queue-wide canary semaphore and starve replay proof for every other subject.
  const builderRows=artifactRows.filter((row:any)=>String(row?.subject_id||'')==='Computer Science & Coding')
  const builderRowByCandidate=new Map<string,any>(builderRows.map((row:any)=>[String(row.candidate_id),row]))
  const builderCompletionAt=new Map<string,string>()
  const builderCandidateIds=[...builderRowByCandidate.keys()]
  for(let offset=0;offset<builderCandidateIds.length;offset+=75){
    const residencyCandidateChunk=builderCandidateIds.slice(offset,offset+75)
    const residency=await db.from('cos_university_residency_enrollments')
      .select('candidate_id,trained_artifact_hash,completed_at')
      .in('candidate_id',residencyCandidateChunk)
      .eq('standing','residency_complete')
      .eq('authority_expanded',false)
      .not('completed_at','is',null)
    if(residency.error) throw residency.error
    for(const row of residency.data||[]){
      const candidateId=String((row as any).candidate_id||'')
      const artifact=builderRowByCandidate.get(candidateId)
      const artifactHash=String((row as any).trained_artifact_hash||'').toLowerCase()
      const completedAt=String((row as any).completed_at||'')
      if(!artifact||artifactHash!==String(artifact.trained_artifact_hash||'').toLowerCase()||!Number.isFinite(Date.parse(completedAt))) continue
      builderCompletionAt.set(candidateId,completedAt)
    }
  }
  const finalGateArtifactRows=artifactRows.filter((row:any)=>
    String(row?.subject_id||'')!=='Computer Science & Coding'
      || builderCompletionAt.has(String(row.candidate_id)))
  const eligibleBuilderProofIds=new Set(confirmedBuilderArtifacts
    .map((row:any)=>String(row.candidate_id))
    .filter((candidateId:string)=>builderCompletionAt.has(candidateId)))
  const eligibleReplayProofIds=new Set(confirmedReplayArtifacts
    .filter((row:any)=>String(row?.subject_id||'')!=='Computer Science & Coding'
      || builderCompletionAt.has(String(row.candidate_id)))
    .map((row:any)=>String(row.candidate_id)))
  const proofCandidateIds=[
    ...eligibleBuilderProofIds,
    ...eligibleReplayProofIds,
  ]
  const candidateIds=[...new Set([...finalGateArtifactRows.map((row:any)=>String(row.candidate_id)),...proofCandidateIds])]
  if(!finalGateArtifactRows.length) return {issued:false,reason:'no_final_gate_eligible_mass_artifacts'}
  // Read only the three policy-relevant evidence streams and page each stream completely.
  // The old global .limit(5000) mixed in teacher/training/provider history; as that history grew,
  // an older exact-artifact canary pass fell out of the window and the issuer re-approved the same
  // already-passed artifact. That approval was intentionally unclaimable and froze the queue.
  const rawEventRows=await readRollingCanaryEvents(db,candidateIds)
  // A canary observed before Builder Residency completion is teaching-stage evidence only. Remove it from
  // final-canary policy state so Residency completion requires a fresh exact-artifact canary as the atomic
  // claim contract requires.
  const eventRows=rawEventRows.filter((row:any)=>{
    const candidateId=String(row?.candidate_id||'')
    const completedAt=builderCompletionAt.get(candidateId)
    if(!completedAt) return true
    if(String(row?.evidence?.profile||'')!==MASS_CANARY_PROFILE) return true
    return Date.parse(String(row?.observed_at||''))>=Date.parse(completedAt)
  })
  // Add window invocations of candidates outside the eligible set. Rows of eligible candidates were already
  // loaded (and Builder-filtered) above; adding only outside candidates keeps per-artifact state unchanged.
  const eligibleCandidateIds=new Set(candidateIds)
  const loadedEventKeys=new Set(eventRows.map(rollingEventKey))
  for(const row of await readRollingWindowInvocations(db,now)){
    if(eligibleCandidateIds.has(String(row?.candidate_id||''))) continue
    const key=rollingEventKey(row)
    if(loadedEventKeys.has(key)) continue
    loadedEventKeys.add(key)
    eventRows.push(row)
  }
  const passedCandidates=new Set(eventRows
    .filter((row:any)=>String(row?.evidence?.claim||'')==='local_distilled_runtime_canary_passed')
    .map((row:any)=>String(row.candidate_id)))
  const builderProofPasses=[...passedCandidates].filter(id=>eligibleBuilderProofIds.has(id)).length
  const remediationReplayProofPasses=[...passedCandidates].filter(id=>eligibleReplayProofIds.has(id)).length
  const decision=decideMassCanaryRollingApproval({
    enabled:process.env.COS_MASS_CANARY_ROLLING_AUTHORIZATION!=='false',
    now,
    builderProofPasses,
    remediationReplayProofPasses,
    artifacts:finalGateArtifactRows.map((row:any)=>{
      const receipt=row?.intended_use?.trainingReceipt && typeof row.intended_use.trainingReceipt==='object'
        ? row.intended_use.trainingReceipt
        : {}
      return {
        candidateId:String(row.candidate_id),
        subjectId:String(row.subject_id||''),
        artifactHash:String(row.trained_artifact_hash||''),
        createdAt:String(row.created_at||''),
        trainingOptimizer:String(receipt.optimizer||''),
        frontierResponseAnchorRequired:receipt.frontierResponseAnchorRequired===true,
        frontierResponseAnchorEpochs:Number(receipt.frontierResponseAnchorEpochs||0),
        frontierResponseAnchorItems:Number(receipt.frontierResponseAnchorItems||0),
        failureDerivedReplayRequired:receipt.failureDerivedReplayRequired===true,
        failureDerivedReplayItems:Number(receipt.failureDerivedReplayItems||0),
        failureDerivedReplayEpochs:Number(receipt.failureDerivedReplayEpochs||0),
        failureDerivedReplayLearningRate:Number(receipt.failureDerivedReplayLearningRate||0),
      }
    }),
    events:eventRows.map((row:any):CanaryEvent=>({candidateId:String(row.candidate_id),observedAt:String(row.observed_at),expiresAt:row.expires_at?String(row.expires_at):null,verifier:String(row.verifier||''),evidence:row.evidence&&typeof row.evidence==='object'?row.evidence:null})),
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

async function approvedColdStartResume(input:{candidateId:string;artifactHash:string;approvalAt:string}){
  const db=cosServiceDb(); if(!db) throw new Error('service_database_unavailable')
  const result=await db.from('cos_university_learning_assurance_events')
    .select('observed_at,evidence')
    .eq('event_type','fine_tune')
    .eq('candidate_id',input.candidateId)
    .eq('verifier','host_controller')
    .contains('evidence',{profile:PROFILE,claim:'local_distilled_runtime_deploy_approved',artifactHash:input.artifactHash})
    .lte('observed_at',input.approvalAt)
    .order('observed_at',{ascending:false})
    .limit(1)
  if(result.error) throw result.error
  const evidence=(result.data?.[0] as any)?.evidence
  if(!evidence||evidence.coldStartResume!==true) return null
  const endpointId=clean(evidence.coldStartResumeEndpointId,120)
  const runtimeKey=clean(evidence.coldStartResumeRuntimeKey,32).toLowerCase()
  if(!/^[a-z0-9_-]{3,120}$/i.test(endpointId)||!/^[a-z0-9]{10}$/.test(runtimeKey)) {
    throw new Error('mass_distilled_cold_start_resume_identity_invalid')
  }
  return Object.freeze({endpointId,runtimeKey})
}

async function readInFlightCanary(now:Date){
  const db=cosServiceDb(); if(!db) throw new Error('service_database_unavailable')
  const since=new Date(now.getTime()-MASS_CANARY_IN_FLIGHT_TTL_MS).toISOString()
  const page=await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,observed_at,evidence')
    .eq('event_type','fine_tune')
    .eq('verifier','host_controller')
    .contains('evidence',{profile:PROFILE})
    .gte('observed_at',since)
    .order('observed_at',{ascending:false})
    .limit(200)
  if(page.error) throw page.error
  const rows=page.data||[]
  for(const row of rows){
    const evidence=(row as any)?.evidence
    if(!evidence||evidence.claim!==INVOCATION_STARTED) continue
    const candidateId=clean((row as any).candidate_id,240)
    const artifactHash=clean(evidence.artifactHash,64).toLowerCase()
    const reservationEventKey=clean(evidence.reservationEventKey,64)
    const startedAt=String((row as any).observed_at||'')
    if(!candidateId||!HEX64.test(artifactHash)||!Number.isFinite(Date.parse(startedAt))) continue
    const terminal=rows.some((other:any)=>{
      const otherEvidence=other?.evidence
      if(!otherEvidence||(otherEvidence.claim!==PASSED&&otherEvidence.claim!==FAILED)) return false
      if(String(other?.candidate_id||'')!==candidateId) return false
      if(clean(otherEvidence.artifactHash,64).toLowerCase()!==artifactHash) return false
      if(Date.parse(String(other?.observed_at||''))<Date.parse(startedAt)) return false
      return !reservationEventKey || clean(otherEvidence.reservationEventKey,64)===reservationEventKey
    })
    if(terminal) continue
    return Object.freeze({
      candidateId,
      artifactHash,
      endpointId:clean(evidence.endpointId,120),
      runtimeKey:clean(evidence.runtimeKey,32).toLowerCase(),
      reservationEventKey,
      startedAt,
      coldStartResume:evidence.coldStartResume===true,
      configuredGpuPools:evidence.configuredGpuPools,
      canaryEligibleGpuPools:evidence.canaryEligibleGpuPools,
      catalogPrices:evidence.canaryCatalogServerlessPriceUsdPerHourByPool,
    })
  }
  return null
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
    if(!claim){
      const inFlight=await readInFlightCanary(new Date())
      if(inFlight){
        await laneStatus('running','canary_in_progress',inFlight)
        return NextResponse.json({ok:true,running:true,reason:'canary_in_progress',candidateId:inFlight.candidateId,endpointId:inFlight.endpointId,startedAt:inFlight.startedAt,approval:rolling})
      }
      await laneStatus('skipped','no_atomically_claimable_mass_distilled_artifact',{approvalIssued:Boolean((rolling as any)?.issued),approvalReason:(rolling as any)?.reason})
      return NextResponse.json({ok:true,skipped:true,reason:'no_atomically_claimable_mass_distilled_artifact',approval:rolling})
    }
    const {artifact,revisionKey}=artifactFromClaim(claim)
    const approvedCost=Number(claim.max_estimated_canary_cost_usd)
    const approvalAt=String(claim.approval_observed_at||'')
    const reservationEventKey=clean(claim.reservation_event_key,64)
    const coldStartResume=await approvedColdStartResume({candidateId:artifact.candidateId,artifactHash:artifact.artifactHash,approvalAt})
    const runtimeKey=coldStartResume?.runtimeKey || hash(['mass-canary-runtime-v3',artifact.artifactHash,approvalAt]).slice(0,10)
    const runtimeArtifact=Object.freeze({...artifact,runtimeKey})
    active=Object.freeze({artifact:runtimeArtifact,revisionKey,approvedCost,approvalAt,reservationEventKey,runtimeKey})

    // Provisioning is preflight. Provider/API/template drift here may be repaired and retried within
    // the same unexpired approval because no model request or paid endpoint wake has happened yet.
    const provisioned=await provisionMassDistilledCanaryRuntime(runtimeArtifact)
    if(coldStartResume && provisioned.endpointId!==coldStartResume.endpointId) {
      throw new Error('mass_distilled_cold_start_resume_endpoint_mismatch')
    }
    const resumeEvidence=coldStartResume?{
      coldStartResume:true,
      coldStartResumeEndpointId:coldStartResume.endpointId,
      coldStartResumeRuntimeKey:coldStartResume.runtimeKey,
    }:{}
    // RunPod's endpoint control plane exposes the configured/eligible pool set, not the physical GPU
    // ultimately assigned to a worker. Persist exactly what is observable and mark actual-worker pool
    // identity as unobserved rather than guessing it from the endpoint configuration.
    const gpuTelemetry={
      configuredGpuPools:provisioned.gpuPools,
      canaryEligibleGpuPools:provisioned.canaryEligibleGpuPools,
      canaryCatalogObserved:provisioned.canaryCatalogObserved,
      canaryCatalogServerlessPriceUsdPerHourByPool:provisioned.canaryCatalogServerlessPriceUsdPerHourByPool,
      actualWorkerGpuPoolObserved:provisioned.actualWorkerGpuPoolObserved,
    }

    // This durable marker is the exact boundary where the single canary invocation becomes consumed.
    // It is written before /ready, because the first endpoint request can wake paid compute.
    await record({candidateId:runtimeArtifact.candidateId,subjectId:runtimeArtifact.subjectId,artifactHash:runtimeArtifact.artifactHash,claim:INVOCATION_STARTED,evidence:{endpointId:provisioned.endpointId,endpointName:provisioned.endpointName,model:provisioned.modelName,attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:approvedCost,authorizationObservedAt:approvalAt,reservationEventKey,runtimeKey,...resumeEvidence,...gpuTelemetry,providerInvocationStarted:true,productionTrafficAuthorized:false,automaticPromotionAuthorized:false}})
    providerInvocationStarted=true
    const workerWarmStart=await activateMassDistilledCanaryWorker(provisioned.endpointId)
    await laneStatus('running','canary_in_progress',{candidateId:runtimeArtifact.candidateId,endpointId:provisioned.endpointId,runtimeKey,coldStartResume:Boolean(coldStartResume),explicitWorkerWarmStart:true,workersMinDuringCanary:workerWarmStart.workersMin,configuredGpuPools:provisioned.gpuPools,canaryEligibleGpuPools:provisioned.canaryEligibleGpuPools,catalogPrices:provisioned.canaryCatalogServerlessPriceUsdPerHourByPool})

    let canary:Awaited<ReturnType<typeof canaryMassDistilledRuntime>>|null=null
    let healthAfter:unknown=null
    let workerScaleDown:unknown=null
    let scaleDownError:string|null=null
    try{
      canary=await canaryMassDistilledRuntime({endpointId:provisioned.endpointId,modelName:provisioned.modelName})
      try{healthAfter=await massDistilledRuntimeHealth(provisioned.endpointId)}
      catch(error){healthAfter={ok:false,error:error instanceof Error?clean(error.message,300):'mass_distilled_health_read_failed'}}
    }finally{
      try{workerScaleDown=await deactivateMassDistilledCanaryWorker(provisioned.endpointId)}
      catch(error){scaleDownError=describeThrownValue(error,300)}
    }

    if(scaleDownError){
      await record({candidateId:runtimeArtifact.candidateId,subjectId:runtimeArtifact.subjectId,artifactHash:runtimeArtifact.artifactHash,claim:FAILED,evidence:{endpointId:provisioned.endpointId,endpointName:provisioned.endpointName,model:provisioned.modelName,attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:approvedCost,error:`mass_distilled_canary_scale_down_failed:${clean(scaleDownError,220)}`,healthAfter,authorizationObservedAt:approvalAt,reservationEventKey,runtimeKey,...resumeEvidence,...gpuTelemetry,explicitWorkerWarmStart:true,workerWarmStart,workerScaleDown:null,providerInvocationStarted:true,productionTrafficAuthorized:false,automaticPromotionAuthorized:false}})
      await laneStatus('failed','canary_scale_down_failed',{candidateId:runtimeArtifact.candidateId,endpointId:provisioned.endpointId,error:clean(scaleDownError,220)})
      return NextResponse.json({ok:false,deployed:true,canaryPassed:false,candidateId:runtimeArtifact.candidateId,endpointId:provisioned.endpointId,error:'mass_distilled_canary_scale_down_failed'},{status:503})
    }
    if(!canary) throw new Error('mass_distilled_canary_result_missing')

    if(!canary.ok){
      await record({candidateId:runtimeArtifact.candidateId,subjectId:runtimeArtifact.subjectId,artifactHash:runtimeArtifact.artifactHash,claim:FAILED,evidence:{endpointId:provisioned.endpointId,endpointName:provisioned.endpointName,model:provisioned.modelName,attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:approvedCost,httpStatus:canary.httpStatus,error:clean(canary.error,300),healthAfter,readyTimeoutMs:MASS_DISTILLED_READY_TIMEOUT_MS,canaryTimeoutMs:MASS_DISTILLED_CANARY_TIMEOUT_MS,idleTimeoutSeconds:MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,authorizationObservedAt:approvalAt,reservationEventKey,runtimeKey,...resumeEvidence,...gpuTelemetry,explicitWorkerWarmStart:true,workerWarmStart,workerScaleDown,providerInvocationStarted:true,productionTrafficAuthorized:false,automaticPromotionAuthorized:false}})
      await laneStatus('failed','canary_failed',{candidateId:runtimeArtifact.candidateId,endpointId:provisioned.endpointId,httpStatus:canary.httpStatus,error:clean(canary.error,300)})
      return NextResponse.json({ok:false,deployed:true,canaryPassed:false,candidateId:runtimeArtifact.candidateId,endpointId:provisioned.endpointId,error:canary.error},{status:503})
    }

    const responseHash=hash(canary.text||'')
    await record({candidateId:runtimeArtifact.candidateId,subjectId:runtimeArtifact.subjectId,artifactHash:runtimeArtifact.artifactHash,claim:PASSED,evidence:{endpointId:provisioned.endpointId,endpointName:provisioned.endpointName,model:provisioned.modelName,httpStatus:canary.httpStatus,responseHash,attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:approvedCost,exactArtifact:true,internalVllmReady:true,scaleToZero:true,authorizationObservedAt:approvalAt,reservationEventKey,runtimeKey,...resumeEvidence,...gpuTelemetry,explicitWorkerWarmStart:true,workerWarmStart,workerScaleDown,providerInvocationStarted:true,productionTrafficAuthorized:false,automaticPromotionAuthorized:false,healthAfter}})
    await recordFineTuneCanary({candidateId:runtimeArtifact.candidateId,subjectId:runtimeArtifact.subjectId,artifactId:runtimeArtifact.artifactId,artifactHash:runtimeArtifact.artifactHash,revisionKey,endpointId:provisioned.endpointId,responseHash})
    await laneStatus('worked','canary_passed',{candidateId:runtimeArtifact.candidateId,endpointId:provisioned.endpointId,model:provisioned.modelName})
    return NextResponse.json({ok:true,deployed:true,canaryPassed:true,candidateId:runtimeArtifact.candidateId,artifactHash:runtimeArtifact.artifactHash,endpointId:provisioned.endpointId,model:provisioned.modelName,productionTrafficAuthorized:false})
  }catch(error){
    const message=describeThrownValue(error,300)
    if(active&&!providerInvocationStarted){
      await record({candidateId:active.artifact.candidateId,subjectId:active.artifact.subjectId,artifactHash:active.artifact.artifactHash,claim:PREFLIGHT_FAILED,evidence:{error:clean(message,300),attemptOrdinal:1,maxCanaryInvocations:1,maxEstimatedCanaryCostUsd:active.approvedCost,authorizationObservedAt:active.approvalAt,reservationEventKey:active.reservationEventKey,runtimeKey:active.runtimeKey,providerInvocationStarted:false,retryableWithinApproval:true,productionTrafficAuthorized:false,automaticPromotionAuthorized:false}}).catch(recordError=>console.error('[runpod-mass-distilled-local-deploy-preflight-record]',JSON.stringify({ok:false,error:clean(recordError instanceof Error?recordError.message:String(recordError),300)})))
    }
    const quotaBlocked=!providerInvocationStarted&&(
      message.startsWith('mass_distilled_runtime_worker_quota_full')
      || message.toLowerCase().includes('max workers across all endpoints must not exceed your workers quota')
    )
    if(quotaBlocked){
      await laneStatus('skipped','runpod_worker_quota_full',{candidateId:active?.artifact.candidateId,retryableWithinApproval:true})
      console.info('[runpod-mass-distilled-local-deploy]',JSON.stringify({ok:true,skipped:true,reason:'runpod_worker_quota_full',claim:active?RESERVED:null,providerInvocationStarted:false}))
      return NextResponse.json({ok:true,skipped:true,reason:'runpod_worker_quota_full',providerInvocationStarted:false})
    }
    await laneStatus('failed','lane_error',{error:clean(message,300),providerInvocationStarted,candidateId:active?.artifact.candidateId})
    console.error('[runpod-mass-distilled-local-deploy]',JSON.stringify({ok:false,error:clean(message,300),claim:active?RESERVED:null,providerInvocationStarted}))
    return NextResponse.json({ok:false,error:clean(message,300),providerInvocationStarted},{status:500})
  }
}
