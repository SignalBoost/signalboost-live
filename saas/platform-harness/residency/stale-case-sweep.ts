// saas/platform-harness/residency/stale-case-sweep.ts
//
// A Residency case that was running when its Vercel invocation was killed (maxDuration) never reaches finishCase:
// its case_runs row stays 'started' forever and its enrollment's updated_at is never bumped, so the oldest-first
// scheduler hands the same resident the next turn again. One case can need a 360s cold start plus a 240s harness
// deadline, which is the whole 600s invocation, so this happened by construction.
//
// A 'started' row older than 20 minutes cannot belong to a live invocation (maxDuration is 10 minutes, and the
// Residency endpoint lease trusts 15). It is closed exactly as the runner closes a harness failure: 'rejected',
// no competency evidence, never a pass or a fail for the student. The enrollment is rotated like finishCase does.
import type { SupabaseClient } from '@supabase/supabase-js'

export const RESIDENCY_STALE_STARTED_CASE_MS = 20 * 60_000
export const RESIDENCY_STALE_CASE_FAILURE_CODE = 'residency_case_invocation_killed' as const
const RESIDENCY_STALE_CASE_SWEEP_LIMIT = 50

export type ResidencyStaleCaseSweep = Readonly<{ closed: number; residencyIds: readonly string[]; errors: readonly string[] }>

/** Pure: which started rows are provably abandoned at `now`. */
export function staleStartedResidencyCases<T extends { status?: unknown; started_at?: unknown }>(rows: readonly T[], now: Date): T[] {
  const cutoff = now.getTime() - RESIDENCY_STALE_STARTED_CASE_MS
  return rows.filter(row => String(row.status) === 'started'
    && Number.isFinite(Date.parse(String(row.started_at ?? '')))
    && Date.parse(String(row.started_at)) < cutoff)
}

export async function closeStaleStartedResidencyCases(db: SupabaseClient, now = new Date()): Promise<ResidencyStaleCaseSweep> {
  const cutoffIso = new Date(now.getTime() - RESIDENCY_STALE_STARTED_CASE_MS).toISOString()
  const read = await db.from('cos_university_residency_case_runs')
    .select('id,residency_id,status,started_at')
    .eq('status', 'started')
    .lt('started_at', cutoffIso)
    .order('started_at', { ascending: true })
    .limit(RESIDENCY_STALE_CASE_SWEEP_LIMIT)
  if (read.error) throw read.error
  const stale = staleStartedResidencyCases((read.data || []) as Array<{ id: unknown; residency_id: unknown; status: unknown; started_at: unknown }>, now)
  const residencyIds = new Set<string>()
  const errors: string[] = []
  let closedCount = 0
  for (const row of stale) {
    const closed = await db.from('cos_university_residency_case_runs').update({
      status: 'rejected',
      harness_outcome: 'harness_failure',
      failure_code: RESIDENCY_STALE_CASE_FAILURE_CODE,
      completed_at: now.toISOString(),
    }).eq('id', String(row.id)).eq('status', 'started')
    if (closed.error) {
      errors.push(String(closed.error.message || 'close_failed').slice(0, 160))
      continue
    }
    closedCount += 1
    residencyIds.add(String(row.residency_id))
  }
  for (const residencyId of residencyIds) {
    const rotated = await db.from('cos_university_residency_enrollments')
      .update({ updated_at: now.toISOString() })
      .eq('id', residencyId)
    if (rotated.error) errors.push(String(rotated.error.message || 'rotate_failed').slice(0, 160))
  }
  return Object.freeze({ closed: closedCount, residencyIds: Object.freeze([...residencyIds]), errors: Object.freeze(errors) })
}
