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
      const client = db()
      const now = new Date().toISOString()
      const richRow = {
        mission_id: missionId,
        state,
        status: state.lifecycle.status,
        iteration: state.lifecycle.iteration,
        blocked_reason: state.lifecycle.blockedReason ?? null,
        completed_at: state.lifecycle.completedAt ?? null,
        updated_at: now,
      }
      const { error } = await client.from(TABLE).upsert(richRow, { onConflict: 'mission_id' })
      if (!error) return

      // Deploy-safe compatibility: Vercel may receive application code before the SQL
      // migration is applied. The full lifecycle still lives inside state JSONB, so fall
      // back to the original three-column shape rather than losing mission persistence.
      const message = error.message || ''
      const looksLikeMissingLifecycleColumn = /status|iteration|blocked_reason|completed_at/i.test(message)
      if (!looksLikeMissingLifecycleColumn) throw new Error(`cos_autonomy_state_save_failed:${message}`)

      const fallback = await client.from(TABLE).upsert({ mission_id: missionId, state, updated_at: now }, { onConflict: 'mission_id' })
      if (fallback.error) throw new Error(`cos_autonomy_state_save_failed:${fallback.error.message}`)
    },
  }
}
