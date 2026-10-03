// saas/lib/ai/cos/cosUniversityAssemblyLineHandoff.ts
//
// Owner, 2026-10-02, rule 2: "When Station 1 finishes, it should immediately hand the artifact to Station 2. We
// should not say, 'Station 2's cron runs in another ten minutes, so wait there.'"
//
// This is the conveyor. When a station finishes with a unit it calls `handOffUnit`, which does two things and nothing
// else: it moves that unit's row to the receiving station at once, so the queue is correct in the same request rather
// than at the next controller tick, and it fires the receiving station's worker. The receiving station still decides
// everything about the unit. The conveyor carries, it does not grade, pass, fail, promote or dismiss.
//
// Why this matters to the wall clock: a unit that finishes the canary at :03 used to wait for the evaluation lane's
// own cron, then for the graduation cron at :07, then for activation on a later tick. The stations were each a few
// minutes apart, so the handoffs were most of the elapsed time. The conveyor removes the waiting between stations and
// leaves only the work.
//
// The one-minute controller remains the safety net. If a push is lost - a cold start, a timeout, a station that
// crashed between its own write and this call - the controller still finds the unit by its station SLA and pokes the
// station. A lost push costs one tick, never a parking lot.
import {
  leaseExpiresAt,
  stationForStatus,
  unitDeadlineAt,
  type Station,
  type StationId,
} from './cosUniversityAssemblyLine.ts'

export const HANDOFF_AUTHORIZATION_REF =
  'owner_explicit_direction_2026-10-02_the_line_owns_the_flow_not_the_stations' as const

export type HandoffPlan = Readonly<{
  from: StationId | null
  to: StationId
  toStation: Station
  /** The worker to fire now. Null at the exit of the line, which needs no transport. */
  triggerPath: string | null
  terminal: boolean
  nextAction: string
  authorityExpanded: false
}>

/**
 * Pure: where a finished unit goes and who to wake.
 *
 * Returns null when the destination status is not on the line, which is the correct answer for a status this module
 * has no business moving. Silence beats guessing a destination.
 */
export function handoffPlan(input: { fromStatus?: string | null; toStatus: string }): HandoffPlan | null {
  const to = stationForStatus(String(input.toStatus || ''))
  if (!to) return null
  const from = input.fromStatus ? stationForStatus(String(input.fromStatus)) : null
  return Object.freeze({
    from: from ? from.id : null,
    to: to.id,
    toStation: to,
    triggerPath: to.terminal ? null : to.workerPath,
    terminal: to.terminal,
    nextAction: to.nextAction,
    authorityExpanded: false as const,
  })
}

type HandoffDb = {
  from(table: string): {
    upsert(row: Record<string, unknown>, options: { onConflict: string }): PromiseLike<{ error?: { message?: string } | null }>
  }
}

export type HandoffResult = Readonly<{
  handed: boolean
  from: StationId | null
  to: StationId | null
  triggered: boolean
  triggerPath: string | null
  reason: string
  authorityExpanded: false
}>

const frozen = (over: Partial<HandoffResult> & { reason: string }): HandoffResult => Object.freeze({
  handed: false,
  from: null,
  to: null,
  triggered: false,
  triggerPath: null,
  authorityExpanded: false as const,
  ...over,
})

/** Bounded, best-effort wake-up for the receiving station. */
export async function triggerStation(input: {
  path: string
  host?: string | null
  secret?: string | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): Promise<{ ok: boolean; status: number; detail: string }> {
  const secret = String(input.secret ?? process.env.CRON_SECRET ?? '')
  if (!secret) return { ok: false, status: 500, detail: 'cron_secret_missing' }
  const rawHost = String(
    input.host
    ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
    ?? process.env.VERCEL_URL
    ?? '',
  ).replace(/^https?:\/\//, '')
  if (!rawHost) return { ok: false, status: 500, detail: 'station_host_unresolved' }
  const protocol = rawHost.includes('localhost') ? 'http' : 'https'
  const call = input.fetchImpl ?? fetch
  try {
    const response = await call(`${protocol}://${rawHost}${input.path}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${secret}`, 'x-cos-assembly-line-handoff': '1' },
      cache: 'no-store',
      signal: AbortSignal.timeout(Math.max(1_000, input.timeoutMs ?? 8_000)),
    })
    const detail = String(await response.text()).replace(/\s+/g, ' ').trim().slice(0, 400)
    return { ok: response.ok, status: response.status, detail }
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown'
    // A timeout means the trigger was delivered and the station outlived this caller. That is a successful handoff:
    // the station's own lease stops duplicate work and the controller verifies movement on its next tick.
    const delivered = name === 'TimeoutError' || name === 'AbortError'
    return { ok: delivered, status: delivered ? 202 : 502, detail: `station_trigger_${name.toLowerCase()}` }
  }
}

/**
 * Move a finished unit to its receiving station and wake that station.
 *
 * Never throws: a station that completed real work must not have its own successful response turned into a failure
 * because the conveyor could not write a bookkeeping row or reach the next worker. The controller's safety net covers
 * exactly that case, so the honest behaviour here is to report what happened and let the caller finish.
 */
export async function handOffUnit(input: {
  db: HandoffDb | null | undefined
  candidateId: string
  artifactHash: string
  subjectId?: string | null
  fromStatus?: string | null
  toStatus: string
  now?: Date
  host?: string | null
  secret?: string | null
  /** False records the handoff without waking the station, for a caller that will fire it itself. */
  trigger?: boolean
  fetchImpl?: typeof fetch
}): Promise<HandoffResult> {
  const candidateId = String(input.candidateId || '').trim()
  const artifactHash = String(input.artifactHash || '').trim().toLowerCase()
  if (!candidateId || !artifactHash) return frozen({ reason: 'handoff_identity_missing' })

  const plan = handoffPlan({ fromStatus: input.fromStatus, toStatus: input.toStatus })
  if (!plan) return frozen({ reason: 'handoff_destination_not_on_line' })

  const now = input.now instanceof Date && Number.isFinite(input.now.getTime()) ? input.now : new Date()
  const station = plan.toStation
  let handed = false

  if (input.db) {
    // Queue position is left for the controller to assign across the whole station. What matters here is that the
    // unit is at the receiving station from this instant, with a watchdog deadline measured from the head of its
    // queue, so a push that lands and then goes quiet is still caught by the safety net.
    const deadlineAt = plan.terminal ? now : unitDeadlineAt({ station, queueAhead: 0, enteredAt: now })
    try {
      const write = await input.db.from('cos_university_lifecycle_orchestration').upsert({
        candidate_id: candidateId,
        artifact_hash: artifactHash,
        subject_id: input.subjectId ? String(input.subjectId) : null,
        stage: station.id,
        station: station.id,
        source_status: station.sourceStatus,
        stage_entered_at: now.toISOString(),
        stage_deadline_at: deadlineAt.toISOString(),
        last_observed_at: now.toISOString(),
        last_transition_at: now.toISOString(),
        orchestration_attempts: 0,
        last_action_at: null,
        next_action: station.nextAction,
        terminal: plan.terminal,
        last_error: null,
        queue_position: null,
        expected_start_at: null,
        lease_until: null,
        lease_holder: null,
        handoff_source: plan.from ? `station:${plan.from}` : 'station:unknown',
        updated_at: now.toISOString(),
      }, { onConflict: 'candidate_id' })
      handed = !write.error
    } catch {
      handed = false
    }
  }

  if (plan.terminal || !plan.triggerPath || input.trigger === false) {
    return frozen({
      handed,
      from: plan.from,
      to: plan.to,
      triggerPath: plan.triggerPath,
      reason: plan.terminal ? 'unit_left_the_line' : (handed ? 'handoff_recorded_without_trigger' : 'handoff_write_failed'),
    })
  }

  const fired = await triggerStation({
    path: plan.triggerPath,
    host: input.host,
    secret: input.secret,
    timeoutMs: 8_000,
    fetchImpl: input.fetchImpl,
  })
  return frozen({
    handed,
    from: plan.from,
    to: plan.to,
    triggered: fired.ok,
    triggerPath: plan.triggerPath,
    reason: fired.ok ? 'handed_off_and_station_woken' : `station_not_woken:${fired.detail}`.slice(0, 200),
  })
}

/** The lease a dispatching controller writes when it gives a lane to a unit. Exported so tests can pin it. */
export function handoffLeaseUntil(station: Station, now: Date): string {
  return leaseExpiresAt(station, now).toISOString()
}
// end of saas/lib/ai/cos/cosUniversityAssemblyLineHandoff.ts (if this line is missing, the paste was cut short)