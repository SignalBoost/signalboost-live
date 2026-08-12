import { latestUserTurnProvenance, recordLatestUserTurnProvenance } from './supportTurnProvenance'

export async function readCosPrimaryPriorProvenance(userId:string|null,precedingAssistant?:string):Promise<Record<string,unknown>|null>{
  if(!userId)return null
  return latestUserTurnProvenance(userId,precedingAssistant?.trim()||undefined)
}

export async function writeCosPrimaryProvenance(userId:string|null,reply:string,provenance:unknown,source:string):Promise<void>{
  if(!userId||!reply||!provenance)return
  await recordLatestUserTurnProvenance(userId,reply,provenance,source)
}
