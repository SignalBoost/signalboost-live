import { cosServiceDb } from '@/lib/cos-core/storage/supabase.ts'

const HEALTH_TASK_ID = 'cos-autonomous-learning-health'
export type AutonomousLearningMode = 'current_world' | 'daily'

export type AutonomousLearningRunHealth = {
  mode: AutonomousLearningMode
  status: string
  succeeded: boolean
  startedAt: string
  finishedAt: string
  latencyMs: number
  documentsAcquired: number
  accepted: number
  probationary: number
  indexed: number
  indexingFailed: number
  rejected: Record<string, number>
  sourceErrors: Record<string, number>
  skipReason: string | null
  deploymentSha: string | null
  recordedAt: string | null
}

function count(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
}

function text(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function cleanCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = String(key).trim().slice(0, 80)
    if (!name) continue
    result[name] = count(raw)
  }
  return result
}

export async function recordAutonomousLearningRun(input: {
  mode: AutonomousLearningMode
  status: string
  succeeded: boolean
  startedAt: string
  finishedAt?: string
  documentsAcquired?: number
  accepted?: number
  probationary?: number
  indexed?: number
  indexingFailed?: number
  rejected?: Record<string, number>
  sourceErrors?: Record<string, number>
  skipReason?: string | null
}): Promise<boolean> {
  const db = cosServiceDb()
  if (!db) return false
  const finishedAt = input.finishedAt || new Date().toISOString()
  const startedMs = Date.parse(input.startedAt)
  const finishedMs = Date.parse(finishedAt)
  const latencyMs = Number.isFinite(startedMs) && Number.isFinite(finishedMs)
    ? Math.max(0, Math.round(finishedMs - startedMs))
    : 0
  const summary = {
    schema: 'cos-autonomous-learning-health-v1',
    mode: input.mode,
    status: String(input.status || 'unknown').slice(0, 80),
    startedAt: input.startedAt,
    finishedAt,
    documentsAcquired: count(input.documentsAcquired),
    accepted: count(input.accepted),
    probationary: count(input.probationary),
    indexed: count(input.indexed),
    indexingFailed: count(input.indexingFailed),
    rejected: cleanCounts(input.rejected),
    sourceErrors: cleanCounts(input.sourceErrors),
    skipReason: text(input.skipReason),
    deploymentSha: text(process.env.VERCEL_GIT_COMMIT_SHA),
  }
  try {
    const { error } = await db.from('cos_learning_observations').insert({
      task_id: HEALTH_TASK_ID,
      capability: input.mode,
      strategy: JSON.stringify(summary),
      succeeded: Boolean(input.succeeded),
      latency_ms: latencyMs,
      external_cost_usd: 0,
      reusable: false,
    })
    if (error) throw error
    return true
  } catch (error) {
    console.warn('[cos-autonomous-learning-health] failed to persist run health', error instanceof Error ? error.message : String(error))
    return false
  }
}

function parseRow(row: any): AutonomousLearningRunHealth | null {
  try {
    const parsed = JSON.parse(String(row?.strategy || '{}'))
    if (parsed?.schema !== 'cos-autonomous-learning-health-v1') return null
    const mode: AutonomousLearningMode = parsed.mode === 'daily' ? 'daily' : 'current_world'
    return {
      mode,
      status: String(parsed.status || 'unknown'),
      succeeded: Boolean(row?.succeeded),
      startedAt: String(parsed.startedAt || ''),
      finishedAt: String(parsed.finishedAt || ''),
      latencyMs: count(row?.latency_ms),
      documentsAcquired: count(parsed.documentsAcquired),
      accepted: count(parsed.accepted),
      probationary: count(parsed.probationary),
      indexed: count(parsed.indexed),
      indexingFailed: count(parsed.indexingFailed),
      rejected: cleanCounts(parsed.rejected),
      sourceErrors: cleanCounts(parsed.sourceErrors),
      skipReason: text(parsed.skipReason),
      deploymentSha: text(parsed.deploymentSha),
      recordedAt: text(row?.created_at),
    }
  } catch {
    return null
  }
}

export async function readAutonomousLearningHealth(): Promise<{
  currentWorld: AutonomousLearningRunHealth | null
  daily: AutonomousLearningRunHealth | null
}> {
  const db = cosServiceDb()
  if (!db) return { currentWorld: null, daily: null }
  try {
    const { data, error } = await db.from('cos_learning_observations')
      .select('capability,strategy,succeeded,latency_ms,created_at')
      .eq('task_id', HEALTH_TASK_ID)
      .in('capability', ['current_world', 'daily'])
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    let currentWorld: AutonomousLearningRunHealth | null = null
    let daily: AutonomousLearningRunHealth | null = null
    for (const row of data ?? []) {
      const parsed = parseRow(row)
      if (!parsed) continue
      if (parsed.mode === 'current_world' && !currentWorld) currentWorld = parsed
      if (parsed.mode === 'daily' && !daily) daily = parsed
      if (currentWorld && daily) break
    }
    return { currentWorld, daily }
  } catch (error) {
    console.warn('[cos-autonomous-learning-health] failed to read run health', error instanceof Error ? error.message : String(error))
    return { currentWorld: null, daily: null }
  }
}

export function autonomousLearningRunFresh(mode: AutonomousLearningMode, run: AutonomousLearningRunHealth | null, now = Date.now()): boolean | null {
  if (!run?.finishedAt) return null
  const finished = Date.parse(run.finishedAt)
  if (!Number.isFinite(finished)) return null
  const maxAgeMs = mode === 'current_world' ? 2 * 60 * 60 * 1000 : 30 * 60 * 60 * 1000
  return now - finished <= maxAgeMs
}
