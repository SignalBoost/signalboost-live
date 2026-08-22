import { latestUserTurnProvenance, recordLatestUserTurnProvenance } from './supportTurnProvenance'
import { buildCosLiveSystemState } from './cosLiveSystemState'
import { getAccess } from '@/lib/auth/access'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { hashPrompt } from './turnExperienceStore'
import { buildOutOfPipelineExperienceRow, ensureProvenanceTurnId, type OutOfPipelineTurn } from './outOfPipelineTurn'

export async function readCosPrimaryPriorProvenance(userId:string|null,precedingAssistant?:string):Promise<Record<string,unknown>|null>{
  if(!userId)return null
  const prior=await latestUserTurnProvenance(userId,precedingAssistant?.trim()||undefined)
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

export async function writeCosPrimaryProvenance(userId:string|null,reply:string,provenance:unknown,source:string,turn?:OutOfPipelineTurn):Promise<void>{
  if(!userId||!reply||!provenance)return
  if(turn){
    const turnId=ensureProvenanceTurnId(provenance)
    if(turnId)await recordOutOfPipelineTurnExperience(turnId,turn)
  }
  await recordLatestUserTurnProvenance(userId,reply,provenance,source)
}
