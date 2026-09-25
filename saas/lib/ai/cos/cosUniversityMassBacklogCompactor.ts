// saas/lib/ai/cos/cosUniversityMassBacklogCompactor.ts
// Conservative backlog compaction for mass-distilled artifacts.
//
// An artifact is never retired because it merely shares a subject with a newer model. The database RPC
// requires exact training lineage and a newer independently-evaluated successor before it can retire an
// untouched evaluation_pending predecessor.

export const MASS_BACKLOG_COMPACTOR_RPC = 'compact_mass_distilled_evaluation_backlog' as const
export const MASS_BACKLOG_COMPACTOR_LIMIT_ENV = 'COS_UNIVERSITY_MASS_BACKLOG_COMPACTOR_MAX_PER_RUN' as const
export const MASS_BACKLOG_COMPACTOR_DEFAULT_LIMIT = 50
export const MASS_BACKLOG_COMPACTOR_MAX_LIMIT = 200

export function massBacklogCompactorLimit(env: Record<string,string|undefined> = process.env): number {
  const raw=String(env[MASS_BACKLOG_COMPACTOR_LIMIT_ENV]||'').trim()
  if(!/^\d+$/.test(raw)) return MASS_BACKLOG_COMPACTOR_DEFAULT_LIMIT
  const value=Number(raw)
  if(!Number.isSafeInteger(value)) return MASS_BACKLOG_COMPACTOR_DEFAULT_LIMIT
  return Math.min(MASS_BACKLOG_COMPACTOR_MAX_LIMIT,Math.max(0,value))
}

export type MassBacklogCompactionRow=Readonly<{
  retired_candidate_id:string
  retired_artifact_hash:string
  superseded_by_candidate_id:string
  superseded_by_artifact_hash:string
  dataset_hash:string
  subject_id:string
}>

export async function compactMassEvaluationBacklog(input:{
  db:{rpc:(fn:string,args:any)=>PromiseLike<{data?:unknown;error?:{message?:string}|null}>}|null|undefined
  env?:Record<string,string|undefined>
}):Promise<Readonly<{retired:readonly MassBacklogCompactionRow[];limit:number}>>{
  const limit=massBacklogCompactorLimit(input.env)
  if(!input.db) throw new Error('service_database_unavailable')
  const result=await input.db.rpc(MASS_BACKLOG_COMPACTOR_RPC,{p_limit:limit})
  if(result?.error) throw new Error(String(result.error.message||'mass_backlog_compactor_failed'))
  const rows=Array.isArray(result?.data)?result.data as MassBacklogCompactionRow[]:[]
  return Object.freeze({retired:Object.freeze(rows.map(row=>Object.freeze({...row}))),limit})
}
