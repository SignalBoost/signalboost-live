import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

const LEASE_MISSION_ID = '__cos_runpod_local_compute__'
const DEFAULT_LEASE_MS = 15 * 60_000

function leaseMs(): number {
  const configured = Number(process.env.COS_RUNPOD_ACTIVITY_LEASE_MS || String(DEFAULT_LEASE_MS))
  if (!Number.isFinite(configured)) return DEFAULT_LEASE_MS
  return Math.max(60_000, Math.min(30 * 60_000, Math.round(configured)))
}

export async function touchRunpodActivityLease(reason: string): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  const now = Date.now()
  const expiresAt = new Date(now + leaseMs()).toISOString()
  const state = {
    kind: 'runpod_local_compute_lease',
    reason: String(reason || 'local_compute').slice(0, 120),
    touchedAt: new Date(now).toISOString(),
    expiresAt,
  }
  const { error } = await db.from('cos_autonomy_state').upsert({
    mission_id: LEASE_MISSION_ID,
    state,
    updated_at: new Date(now).toISOString(),
  }, { onConflict: 'mission_id' })
  if (error) console.warn('[cos-runpod-lease] failed to persist activity lease', error.message)
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
