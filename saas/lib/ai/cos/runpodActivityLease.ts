import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { localInferenceTargetsRunpod } from '@/lib/ai/cos/runpodConfig'

const LEASE_MISSION_ID = '__cos_runpod_local_compute__'
const DEFAULT_LEASE_MS = 15 * 60_000

function leaseMs(): number {
  const configured = Number(process.env.COS_RUNPOD_ACTIVITY_LEASE_MS || String(DEFAULT_LEASE_MS))
  if (!Number.isFinite(configured)) return DEFAULT_LEASE_MS
  return Math.max(60_000, Math.min(30 * 60_000, Math.round(configured)))
}

/**
 * Mark legitimate RunPod GPU work before it begins. Once LOCAL_AI_BASE_URL points at another
 * OpenAI-compatible provider, this becomes a no-op: a DeepInfra/Fireworks/customer-vLLM request is
 * not RunPod activity and must not refresh a stale RunPod lease or distort the owner-visible cost
 * clock.
 */
export async function touchRunpodActivityLease(reason: string): Promise<void> {
  if (!localInferenceTargetsRunpod()) return
  const db = cosServiceDb()
  if (!db) return
  const now = Date.now()
  const touchedAt = new Date(now).toISOString()
  const expiresAt = new Date(now + leaseMs()).toISOString()
  const cleanReason = String(reason || 'local_compute').slice(0, 120)
  const state = {
    kind: 'runpod_local_compute_lease',
    reason: cleanReason,
    touchedAt,
    expiresAt,
  }

  const [leaseWrite, activityWrite] = await Promise.all([
    db.from('cos_autonomy_state').upsert({
      mission_id: LEASE_MISSION_ID,
      state,
      updated_at: touchedAt,
    }, { onConflict: 'mission_id' }),
    db.from('cos_ai_roi_metrics').insert({
      task_id: `runpod:${cleanReason}`,
      source: 'local_compute_activity',
      provider_calls: 0,
      estimated_provider_cost_usd: 0,
      estimated_cost_avoided_usd: 0,
      prompt_characters_before: 0,
      prompt_characters_after: 0,
      latency_ms: 0,
      created_at: touchedAt,
    }),
  ])

  if (leaseWrite.error) console.warn('[cos-runpod-lease] failed to persist activity lease', leaseWrite.error.message)
  if (activityWrite.error) console.warn('[cos-runpod-lease] failed to persist local-compute activity marker', activityWrite.error.message)
}

export async function activeRunpodActivityLease(): Promise<{ active: boolean; expiresAt: string | null; reason: string | null }> {
  const db = cosServiceDb()
  if (!db) return { active: false, expiresAt: null, reason: null }
  const { data, error } = await db.from('cos_autonomy_state').select('state').eq('mission_id', LEASE_MISSION_ID).maybeSingle()
  if (error || !data?.state || typeof data.state !== 'object') return { active: false, expiresAt: null, reason: null }
  const state = data.state as Record<string, unknown>
  const expiresAt = typeof state.expiresAt === 'string' ? state.expiresAt : null
  const expiresMs = expiresAt ? new Date(expiresAt).getTime() : Number.NaN
  return {
    active: Number.isFinite(expiresMs) && expiresMs > Date.now(),
    expiresAt,
    reason: typeof state.reason === 'string' ? state.reason : null,
  }
}
