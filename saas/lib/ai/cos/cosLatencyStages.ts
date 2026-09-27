// LATENCY STAGE TIMINGS (2026-09-27, owner-directed speed work). Owner chat answers took ~25s and the
// stages in front of the answer model (the first-turn planner, routing, and each internal-context
// source) were not recorded anywhere the owner can query. Each stage writes one row to
// cos_ai_roi_metrics (task_id 'cos-latency-stage', source = stage name, latency_ms = duration), so a
// single SQL query shows where a turn's time went. Fire-and-forget: a timing write never delays or
// fails a user turn.
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const COS_LATENCY_STAGE_TASK_ID = 'cos-latency-stage'

export function recordCosLatencyStage(stage: string, latencyMs: number): void {
  const source = String(stage || '').trim().slice(0, 120)
  const ms = Math.max(0, Math.floor(Number(latencyMs) || 0))
  if (!source) return
  try {
    const db = cosServiceDb()
    if (!db) return
    void Promise.resolve(db.from('cos_ai_roi_metrics').insert({
      task_id: COS_LATENCY_STAGE_TASK_ID,
      source,
      latency_ms: ms,
    })).then(result => {
      const error = (result as { error?: { message?: string } | null } | null)?.error
      if (error) console.warn('[cos-latency-stage] write failed', error.message)
    }, error => {
      console.warn('[cos-latency-stage] write failed', error instanceof Error ? error.message : String(error))
    })
  } catch (error) {
    console.warn('[cos-latency-stage] write failed', error instanceof Error ? error.message : String(error))
  }
}
