import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import {
  DISTILLED_V6_ADAPTER_MODEL_ID,
  DISTILLED_V6_ADAPTER_MODEL_REVISION,
  DISTILLED_V6_BASE_MODEL_ID,
  DISTILLED_V6_BASE_MODEL_REVISION,
  DISTILLED_V6_CANARY_TIMEOUT_MS,
  DISTILLED_V6_ENDPOINT_NAME,
  DISTILLED_V6_MAX_COST_USD,
  DISTILLED_V6_MODEL_NAME,
  DISTILLED_V6_READY_TIMEOUT_MS,
  canaryDistilledV6,
  distilledV6Health,
  provisionDistilledV6,
} from '@/lib/ai/cos/runpodDistilledV6Provision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PROFILE = 'cos_local_distilled_runtime_deploy_v6'
const CANDIDATE_ID = 'study-plan:e23cb043-715e-4406-8898-421159fae2df'
const ARTIFACT_HASH = 'bd7b151e75cc963d02597529b7256b755419dd20bcd2c36ca849e903d99421e4'
const REVISION_KEY = '4176a5aeda84ceafeff9b0fc29af833d028d7a891b028d4c479b8ca653d7b65d'
const APPROVAL = 'local_distilled_runtime_v6_deploy_approved'
const STARTED = 'local_distilled_runtime_v6_canary_started'
const FAILED = 'local_distilled_runtime_v6_canary_failed'
const PASSED = 'local_distilled_runtime_v6_canary_passed'
const MAX_INVOCATIONS = 1
const MIN_BALANCE_USD = 1

const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clean=(value:unknown,max=300)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max)

async function events(){const db=cosServiceDb();if(!db)throw new Error('service_database_unavailable');const r=await db.from('cos_university_learning_assurance_events').select('evidence,verifier,observed_at,expires_at').eq('event_type','fine_tune').eq('candidate_id',CANDIDATE_ID).order('observed_at',{ascending:false}).limit(200);if(r.error)throw r.error;return r.data||[]}
async function record(claim:string,evidence:Record<string,unknown>,verifier='host_controller'){const db=cosServiceDb();if(!db)throw new Error('service_database_unavailable');const body={profile:PROFILE,claim,candidateId:CANDIDATE_ID,artifactHash:ARTIFACT_HASH,...evidence,authorityExpanded:false};const evidenceHash=hash(body);const r=await db.from('cos_university_learning_assurance_events').upsert({event_key:hash([PROFILE,claim,CANDIDATE_ID,ARTIFACT_HASH,evidenceHash]),event_type:'fine_tune',subject_id:'reasoning_decision_science',candidate_id:CANDIDATE_ID,evidence_hash:evidenceHash,evidence:body,verifier,observed_at:new Date().toISOString()},{onConflict:'event_key',ignoreDuplicates:true});if(r.error)throw r.error}
async function recordCanonicalCanary(endpointId:string,responseHash:string){const db=cosServiceDb();if(!db)throw new Error('service_database_unavailable');const evidence={profile:'cos_university_fine_tune_evidence_v1',claim:'production_canary_healthy',candidateId:CANDIDATE_ID,revisionKey:REVISION_KEY,trainedArtifactId:DISTILLED_V6_ADAPTER_MODEL_ID,artifactHash:ARTIFACT_HASH,evidenceRef:`db://cos_university_learning_assurance_events/${hash(['v6-production-canary',endpointId,responseHash])}`,endpointId,responseHash,exactArtifact:true,scaleToZero:true,productionTrafficAuthorized:false,authorityExpanded:false};const evidenceHash=hash(evidence);const r=await db.from('cos_university_learning_assurance_events').upsert({event_key:hash(['cos_university_fine_tune_evidence_v1','production_canary_healthy',CANDIDATE_ID,ARTIFACT_HASH,endpointId,responseHash]),event_type:'fine_tune',subject_id:'reasoning_decision_science',candidate_id:CANDIDATE_ID,evidence_hash:evidenceHash,evidence,verifier:'host_production_verifier',observed_at:new Date().toISOString()},{onConflict:'event_key',ignoreDuplicates:true});if(r.error)throw r.error}

export async function GET(req:NextRequest){
  const secret=process.env.CRON_SECRET
  if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return NextResponse.json({ok:false,error:'Unauthorized'},{status:401})
  try{
    const rows=await events();const now=Date.now()
    const approval=rows.find((row:any)=>{const e=row.evidence||{};const observed=Date.parse(String(row.observed_at||''));const expires=Date.parse(String(row.expires_at||''));return row.verifier==='host_controller'&&e.profile===PROFILE&&e.claim===APPROVAL&&e.artifactHash===ARTIFACT_HASH&&e.canaryAuthorized===true&&Number(e.maxCanaryInvocations||0)===MAX_INVOCATIONS&&Number(e.maxEstimatedCanaryCostUsd||0)<=DISTILLED_V6_MAX_COST_USD&&e.productionTrafficAuthorized===false&&e.authorityExpanded===false&&Number.isFinite(observed)&&observed<=now&&Number.isFinite(expires)&&expires>now})
    if(!approval)return NextResponse.json({ok:true,skipped:true,reason:'explicit_v6_owner_approval_missing_or_expired'})
    if(rows.some((row:any)=>row?.evidence?.profile===PROFILE&&row?.evidence?.claim===PASSED&&row?.evidence?.artifactHash===ARTIFACT_HASH))return NextResponse.json({ok:true,deployed:true,canaryPassed:true,reason:'already_proven'})
    const starts=rows.filter((row:any)=>row?.evidence?.profile===PROFILE&&row?.evidence?.claim===STARTED&&row?.evidence?.artifactHash===ARTIFACT_HASH&&Date.parse(String(row.observed_at||''))>=Date.parse(String((approval as any).observed_at||''))).length
    if(starts>=MAX_INVOCATIONS)return NextResponse.json({ok:false,error:'distilled_v6_canary_retry_ceiling'},{status:503})
    const account=await queryRunpodAccountStatus();if(account.clientBalance!==null&&account.clientBalance<MIN_BALANCE_USD)return NextResponse.json({ok:false,error:'runpod_balance_guard',balance:account.clientBalance},{status:402})
    const provisioned=await provisionDistilledV6()
    await record(STARTED,{endpointId:provisioned.endpointId,endpointName:DISTILLED_V6_ENDPOINT_NAME,model:DISTILLED_V6_MODEL_NAME,baseModelId:DISTILLED_V6_BASE_MODEL_ID,baseModelRevision:DISTILLED_V6_BASE_MODEL_REVISION,adapterModelId:DISTILLED_V6_ADAPTER_MODEL_ID,adapterModelRevision:DISTILLED_V6_ADAPTER_MODEL_REVISION,readyTimeoutMs:DISTILLED_V6_READY_TIMEOUT_MS,canaryTimeoutMs:DISTILLED_V6_CANARY_TIMEOUT_MS,maxEstimatedCanaryCostUsd:DISTILLED_V6_MAX_COST_USD,productionTrafficAuthorized:false})
    const healthBefore=await distilledV6Health(provisioned.endpointId)
    const canary=await canaryDistilledV6(provisioned.endpointId)
    const healthAfter=await distilledV6Health(provisioned.endpointId)
    if(!canary.ok){await record(FAILED,{endpointId:provisioned.endpointId,endpointName:DISTILLED_V6_ENDPOINT_NAME,httpStatus:canary.httpStatus,error:clean(canary.error),healthBefore,healthAfter,productionTrafficAuthorized:false});return NextResponse.json({ok:false,deployed:true,canaryPassed:false,endpointId:provisioned.endpointId,error:canary.error},{status:503})}
    const responseHash=hash(canary.text||'')
    await record(PASSED,{endpointId:provisioned.endpointId,endpointName:DISTILLED_V6_ENDPOINT_NAME,httpStatus:canary.httpStatus,responseHash,exactArtifact:true,internalVllmReady:true,scaleToZero:true,healthBefore,healthAfter,productionTrafficAuthorized:false})
    await recordCanonicalCanary(provisioned.endpointId,responseHash)
    return NextResponse.json({ok:true,deployed:true,canaryPassed:true,endpointId:provisioned.endpointId,model:DISTILLED_V6_MODEL_NAME,productionTrafficAuthorized:false})
  }catch(error){const message=error instanceof Error?error.message:String(error);console.error('[runpod-distilled-v6-local-deploy]',JSON.stringify({ok:false,error:clean(message)}));return NextResponse.json({ok:false,error:clean(message)},{status:500})}
}
