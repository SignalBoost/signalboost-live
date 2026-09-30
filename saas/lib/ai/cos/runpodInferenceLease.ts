import { randomUUID } from 'node:crypto'
import { cosServiceDb } from '../../cos-core/storage/supabase.ts'

const LEASE_MISSION_ID = '__cos_runpod_primary_inference_slot__'
const DEFAULT_WAIT_MS = 15_000
const MAX_WAIT_MS = 45_000
const POLL_MS = 500

export type RunpodInferenceLease = Readonly<{
  token: string
  acquiredAt: string
  expiresAt: string
}>

function waitMs(): number {
  const configured = Number(process.env.RUNPOD_PRIMARY_QUEUE_WAIT_MS || String(DEFAULT_WAIT_MS))
  if (!Number.isFinite(configured)) return DEFAULT_WAIT_MS
  return Math.max(0, Math.min(MAX_WAIT_MS, Math.round(configured)))
}

function leaseMs(inferenceTimeoutMs: number): number {
  const timeout = Number.isFinite(inferenceTimeoutMs) ? Math.max(5_000, inferenceTimeoutMs) : 120_000
  return Math.min(5 * 60_000, timeout + 30_000)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function tryAcquire(token: string, inferenceTimeoutMs: number): Promise<RunpodInferenceLease | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('runpod_primary_lease_storage_unavailable')

  const now = Date.now()
  const acquiredAt = new Date(now).toISOString()
  const expiresAt = new Date(now + leaseMs(inferenceTimeoutMs)).toISOString()
  const state = {
    kind: 'runpod_primary_inference_slot',
    token,
    acquiredAt,
    expiresAt,
  }

  const read = await db.from('cos_autonomy_state')
    .select('state,updated_at')
    .eq('mission_id', LEASE_MISSION_ID)
    .maybeSingle()
  if (read.error) throw new Error(`runpod_primary_lease_read_failed:${read.error.message}`)

  if (!read.data) {
    const inserted = await db.from('cos_autonomy_state').insert({
      mission_id: LEASE_MISSION_ID,
      state,
      updated_at: acquiredAt,
    }).select('mission_id').maybeSingle()
    if (!inserted.error && inserted.data) return Object.freeze({ token, acquiredAt, expiresAt })
    if (inserted.error?.code === '23505') return null
    throw new Error(`runpod_primary_lease_insert_failed:${inserted.error?.message || 'unknown'}`)
  }

  const priorState = read.data.state && typeof read.data.state === 'object'
    ? read.data.state as Record<string, unknown>
    : {}
  const priorExpiresAt = typeof priorState.expiresAt === 'string' ? Date.parse(priorState.expiresAt) : Number.NaN
  if (Number.isFinite(priorExpiresAt) && priorExpiresAt > now) return null

  const updated = await db.from('cos_autonomy_state').update({
    state,
    updated_at: acquiredAt,
  }).eq('mission_id', LEASE_MISSION_ID)
    .eq('updated_at', read.data.updated_at)
    .select('mission_id')
    .maybeSingle()
  if (updated.error) throw new Error(`runpod_primary_lease_update_failed:${updated.error.message}`)
  return updated.data ? Object.freeze({ token, acquiredAt, expiresAt }) : null
}

/**
 * Serialize access to the single iTMounts RunPod reasoner across Vercel instances. The lease is
 * short-lived and self-expiring so a terminated serverless invocation cannot strand the GPU.
 */
export async function acquireRunpodInferenceLease(inferenceTimeoutMs: number): Promise<RunpodInferenceLease | null> {
  const token = randomUUID()
  const deadline = Date.now() + waitMs()
  do {
    const lease = await tryAcquire(token, inferenceTimeoutMs)
    if (lease) return lease
    if (Date.now() >= deadline) return null
    await sleep(Math.min(POLL_MS, Math.max(1, deadline - Date.now())))
  } while (Date.now() <= deadline)
  return null
}

/**
 * One attempt, no waiting. Live chat must never queue behind background work on the single RunPod reasoner.
 * null = the slot is held by other work right now.
 */
export async function tryAcquireRunpodInferenceLeaseNow(inferenceTimeoutMs: number): Promise<RunpodInferenceLease | null> {
  return tryAcquire(randomUUID(), inferenceTimeoutMs)
}

export async function releaseRunpodInferenceLease(lease: RunpodInferenceLease): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  const read = await db.from('cos_autonomy_state')
    .select('state,updated_at')
    .eq('mission_id', LEASE_MISSION_ID)
    .maybeSingle()
  if (read.error || !read.data) return
  const state = read.data.state && typeof read.data.state === 'object'
    ? read.data.state as Record<string, unknown>
    : {}
  if (state.token !== lease.token) return

  const releasedAt = new Date().toISOString()
  await db.from('cos_autonomy_state').update({
    state: {
      kind: 'runpod_primary_inference_slot',
      token: null,
      releasedAt,
      expiresAt: releasedAt,
    },
    updated_at: releasedAt,
  }).eq('mission_id', LEASE_MISSION_ID)
    .eq('updated_at', read.data.updated_at)
}

// CHAT PRIORITY (2026-09-30). A background Builder generation can hold the single RunPod slot for ~100 s. When a
// chat question lands during that time it is answered by the managed backup, which production showed can take
// 26-29 s (05:32 and 05:48 UTC) instead of ~6-12 s on RunPod. While someone is chatting, Builder work waits:
// every chat attempt marks demand, and Builder does not take the slot within the priority window after it.
// Builder already treats a busy slot as a deferral (no paid fallback), so this costs nothing.
const CHAT_PRIORITY_MISSION_ID = '__cos_runpod_chat_priority__'
const DEFAULT_CHAT_PRIORITY_MS = 180_000

export function chatPriorityWindowMs(): number {
  const configured = Number(process.env.COS_CHAT_RUNPOD_PRIORITY_MS || String(DEFAULT_CHAT_PRIORITY_MS))
  if (!Number.isFinite(configured)) return DEFAULT_CHAT_PRIORITY_MS
  return Math.max(0, Math.min(15 * 60_000, Math.round(configured)))
}

/** True while the last chat demand for RunPod is inside the priority window. */
export function chatDemandIsRecent(lastDemandAt: unknown, now: number, windowMs = chatPriorityWindowMs()): boolean {
  if (windowMs <= 0 || typeof lastDemandAt !== 'string') return false
  const at = Date.parse(lastDemandAt)
  return Number.isFinite(at) && now - at >= -60_000 && now - at < windowMs
}

export async function markChatRunpodDemand(): Promise<void> {
  try {
    const db = cosServiceDb()
    if (!db) return
    const at = new Date().toISOString()
    await db.from('cos_autonomy_state').upsert({
      mission_id: CHAT_PRIORITY_MISSION_ID,
      state: { kind: 'runpod_chat_priority', lastDemandAt: at },
      updated_at: at,
    }, { onConflict: 'mission_id' })
  } catch (error) {
    console.warn('[runpod-chat-priority-mark]', error instanceof Error ? error.message : String(error))
  }
}

export async function chatHasRunpodPriority(): Promise<boolean> {
  try {
    const db = cosServiceDb()
    if (!db) return false
    const { data, error } = await db.from('cos_autonomy_state').select('state').eq('mission_id', CHAT_PRIORITY_MISSION_ID).maybeSingle()
    if (error || !data?.state || typeof data.state !== 'object') return false
    return chatDemandIsRecent((data.state as Record<string, unknown>).lastDemandAt, Date.now())
  } catch {
    return false
  }
}