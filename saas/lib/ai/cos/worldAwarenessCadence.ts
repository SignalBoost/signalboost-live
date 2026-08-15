import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export type WorldAwarenessCadence = 'daily' | 'twice_daily' | 'hourly' | 'near_realtime' | 'custom'

export type WorldAwarenessCadencePolicy = {
  cadence: WorldAwarenessCadence
  intervalMinutes: number
  source: 'preset' | 'custom_interval'
}

const PRESETS: Record<Exclude<WorldAwarenessCadence,'custom'>,number> = {
  daily: 24 * 60,
  twice_daily: 12 * 60,
  hourly: 60,
  near_realtime: 15,
}

function boundedMinutes(value: unknown): number | null {
  const parsed=Number(value)
  if(!Number.isFinite(parsed))return null
  return Math.max(15,Math.min(24*60,Math.floor(parsed)))
}

/**
 * Enterprise cost dial. A custom minute interval wins; otherwise use a named preset.
 * Default is twice daily for the SignalBoost deployment. Enterprise buyers can move to
 * hourly or near-real-time without a code change.
 */
export function worldAwarenessCadencePolicy(env:NodeJS.ProcessEnv=process.env):WorldAwarenessCadencePolicy{
  const custom=boundedMinutes(env.COS_WORLD_AWARENESS_INTERVAL_MINUTES)
  if(custom!=null)return{cadence:'custom',intervalMinutes:custom,source:'custom_interval'}
  const raw=String(env.COS_WORLD_AWARENESS_CADENCE||'twice_daily').trim().toLowerCase().replace(/[ -]+/g,'_')
  const cadence=(raw in PRESETS?raw:'twice_daily') as Exclude<WorldAwarenessCadence,'custom'>
  return{cadence,intervalMinutes:PRESETS[cadence],source:'preset'}
}

export type WorldAwarenessDueResult={
  due:boolean
  policy:WorldAwarenessCadencePolicy
  lastRefreshAt:string|null
  nextRefreshAt:string|null
  reason:string
}

export async function worldAwarenessDue(nowMs=Date.now(),env:NodeJS.ProcessEnv=process.env):Promise<WorldAwarenessDueResult>{
  const policy=worldAwarenessCadencePolicy(env)
  const db=cosServiceDb()
  if(!db)return{due:true,policy,lastRefreshAt:null,nextRefreshAt:null,reason:'no_service_store_state'}
  try{
    const result=await db.from('cos_world_awareness').select('ingested_at').order('ingested_at',{ascending:false}).limit(1).maybeSingle()
    if(result.error)throw result.error
    const lastRaw=String(result.data?.ingested_at||'').trim()
    if(!lastRaw)return{due:true,policy,lastRefreshAt:null,nextRefreshAt:null,reason:'never_refreshed'}
    const lastMs=Date.parse(lastRaw)
    if(!Number.isFinite(lastMs))return{due:true,policy,lastRefreshAt:null,nextRefreshAt:null,reason:'invalid_last_refresh'}
    const intervalMs=policy.intervalMinutes*60*1000
    const nextMs=lastMs+intervalMs
    return{
      due:nowMs>=nextMs,
      policy,
      lastRefreshAt:new Date(lastMs).toISOString(),
      nextRefreshAt:new Date(nextMs).toISOString(),
      reason:nowMs>=nextMs?'cadence_due':'cadence_not_due',
    }
  }catch(error){
    return{due:true,policy,lastRefreshAt:null,nextRefreshAt:null,reason:`cadence_state_unavailable:${error instanceof Error?error.message:String(error)}`}
  }
}
