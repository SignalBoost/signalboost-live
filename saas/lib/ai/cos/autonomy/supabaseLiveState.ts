import { createClient } from '@supabase/supabase-js'
import type { CosLivePersistentState, CosLiveTickStateStore } from './liveRuntime.ts'

const TABLE = 'cos_autonomy_state'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export function createSupabaseCosLiveTickStateStore(): CosLiveTickStateStore {
  return {
    async load(missionId) {
      const { data, error } = await db().from(TABLE).select('state').eq('mission_id', missionId).maybeSingle()
      if (error) throw new Error(`cos_autonomy_state_load_failed:${error.message}`)
      return data?.state as CosLivePersistentState | undefined
    },
    async save(missionId, state) {
      const { error } = await db().from(TABLE).upsert({
        mission_id: missionId,
        state,
        status: state.lifecycle.status,
        iteration: state.lifecycle.iteration,
        blocked_reason: state.lifecycle.blockedReason ?? null,
        completed_at: state.lifecycle.completedAt ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'mission_id' })
      if (error) throw new Error(`cos_autonomy_state_save_failed:${error.message}`)
    },
  }
}
