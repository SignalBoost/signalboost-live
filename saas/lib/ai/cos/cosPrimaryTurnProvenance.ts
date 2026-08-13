import { latestUserTurnProvenance, recordLatestUserTurnProvenance } from './supportTurnProvenance'
import { buildCosLiveSystemState } from './cosLiveSystemState'
import { getAccess } from '@/lib/auth/access'

export async function readCosPrimaryPriorProvenance(userId:string|null,precedingAssistant?:string):Promise<Record<string,unknown>|null>{
  if(!userId)return null
  const prior=await latestUserTurnProvenance(userId,precedingAssistant?.trim()||undefined)
  if(!prior)return null
  const access=await getAccess().catch(()=>null)
  if(!access?.isOwner&&!access?.isAdmin)return prior
  const liveSystemState=await buildCosLiveSystemState({userId,privileged:true}).catch(()=>null)
  return liveSystemState?{...prior,live_system_state:liveSystemState}:prior
}

export async function writeCosPrimaryProvenance(userId:string|null,reply:string,provenance:unknown,source:string):Promise<void>{
  if(!userId||!reply||!provenance)return
  await recordLatestUserTurnProvenance(userId,reply,provenance,source)
}
