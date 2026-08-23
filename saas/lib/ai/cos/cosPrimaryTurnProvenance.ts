import { normalizeAssistantContent, recordLatestUserTurnProvenance } from './supportTurnProvenance'
import { buildCosLiveSystemState } from './cosLiveSystemState'
import { responseLineageStrength } from './responseLineage.ts'
import { getAccess } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { hashPrompt } from './turnExperienceStore'
import { buildOutOfPipelineExperienceRow, ensureProvenanceTurnId, type OutOfPipelineTurn } from './outOfPipelineTurn'

export async function readCosPrimaryPriorProvenance(userId:string|null,precedingAssistant?:string):Promise<Record<string,unknown>|null>{
  if(!userId)return null
  const db=cosServiceDb()
  if(!db)return null
  const expected=precedingAssistant?normalizeAssistantContent(precedingAssistant):''
  let prior:Record<string,unknown>|null=null
  try{
    const {data,error}=await db.from('cos_latest_turn_provenance').select('assistant_content,provenance').eq('user_id',userId).maybeSingle()
    if(error)throw error
    if(data?.provenance&&(!expected||normalizeAssistantContent(data.assistant_content)===expected))prior=data.provenance as Record<string,unknown>
  }catch(error){
    console.error('cosPrimaryTurnProvenance: prior provenance read failed',error)
  }
  if(!prior)return null
  const access=await getAccess().catch(()=>null)
  if(!access?.isOwner&&!access?.isAdmin)return prior
  const liveSystemState=await buildCosLiveSystemState({userId,privileged:true}).catch(()=>null)
  return liveSystemState?{...prior,live_system_state:liveSystemState}:prior
}

async function recordOutOfPipelineTurnExperience(turnId: string, turn: OutOfPipelineTurn): Promise<void> {
  try {
    const db = cosServiceDb()
    if (!db) return
    const result = await db.from('cos_turn_experience').upsert(
      buildOutOfPipelineExperienceRow(turnId, turn, hashPrompt),
      { onConflict: 'turn_id', ignoreDuplicates: true },
    )
    if (result.error) throw result.error
  } catch (error) {
    console.warn('[cos-primary-turn-experience] record failed (non-fatal):', error instanceof Error ? error.message : String(error))
  }
}

export { ensureProvenanceTurnId }

type RecentBoundLineage={provenance:Record<string,unknown>;source:string|null;updatedAt:string}

async function recentResponseBoundLineage(userId:string,reply:string):Promise<RecentBoundLineage|null>{
  const db=cosServiceDb(); if(!db)return null
  try{
    const {data,error}=await db.from('cos_latest_turn_provenance')
      .select('assistant_content,provenance,source,updated_at')
      .eq('user_id',userId)
      .maybeSingle()
    if(error||!data?.provenance)return null
    if(normalizeAssistantContent(data.assistant_content)!==normalizeAssistantContent(reply))return null
    const updatedAt=String(data.updated_at||'')
    const age=Date.now()-Date.parse(updatedAt)
    if(!Number.isFinite(age)||age<0||age>30_000)return null
    return{provenance:data.provenance as Record<string,unknown>,source:data.source?String(data.source):null,updatedAt}
  }catch(error){
    console.warn('[cos-primary-provenance] response-bound lineage lookup failed (non-fatal):',error instanceof Error?error.message:String(error))
    return null
  }
}

function supersededAttempt(provenance:any,source:string){
  return{
    turn_id:provenance?.turnId??null,
    source,
    local_reasoning_invoked:Boolean(provenance?.local_reasoning?.invoked),
    local_confidence:Number.isFinite(Number(provenance?.local_reasoning?.confidence))?Number(provenance.local_reasoning.confidence):null,
    local_threshold:Number.isFinite(Number(provenance?.local_reasoning?.threshold))?Number(provenance.local_reasoning.threshold):null,
    external_ai_invoked:Boolean(provenance?.external_ai?.invoked),
    external_provider:provenance?.external_ai?.provider??null,
    external_model:provenance?.external_ai?.model??null,
    disposition:'superseded_same_response_weaker_lineage',
  }
}

export async function writeCosPrimaryProvenance(userId:string|null,reply:string,provenance:unknown,source:string,turn?:OutOfPipelineTurn):Promise<void>{
  if(!userId||!reply||!provenance)return
  if(turn){
    const turnId=ensureProvenanceTurnId(provenance)
    if(turnId)await recordOutOfPipelineTurnExperience(turnId,turn)
  }

  // The COS-primary wrapper can make attempt A, then call the legacy/support path which makes
  // attempt B. The support path persists B before control returns here. Never let a rejected A
  // overwrite B merely because the outer wrapper completes a few milliseconds later.
  const existing=await recentResponseBoundLineage(userId,reply)
  const candidateStrength=responseLineageStrength(provenance)
  const existingStrength=responseLineageStrength(existing?.provenance)
  if(existing&&existingStrength>candidateStrength){
    const previous=Array.isArray((existing.provenance as any).superseded_attempts)?(existing.provenance as any).superseded_attempts:[]
    const enriched={
      ...existing.provenance,
      superseded_attempts:[...previous,supersededAttempt(provenance,source)].slice(-4),
    }
    await recordLatestUserTurnProvenance(userId,reply,enriched,existing.source||'cos-response-lineage-preserved')
    console.warn('[cos-primary-provenance] preserved stronger response-bound lineage',JSON.stringify({
      existingSource:existing.source,
      existingStrength,
      candidateSource:source,
      candidateStrength,
      existingTurnId:(existing.provenance as any)?.turnId??null,
      candidateTurnId:(provenance as any)?.turnId??null,
    }))
    return
  }

  await recordLatestUserTurnProvenance(userId,reply,provenance,source)
}
