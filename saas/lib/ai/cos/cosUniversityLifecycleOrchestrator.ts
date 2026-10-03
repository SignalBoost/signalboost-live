// saas/lib/ai/cos/cosUniversityLifecycleOrchestrator.ts
//
// Durable forward-progress policy for trained University artifacts. This controller never grades, promotes,
// dismisses or widens authority. It owns only the obligation that every nonterminal artifact has a named next
// action and a deadline.
//
// Owner, 2026-10-02: "the deadlines become station SLAs/watchdogs, not timers that normally trigger movement."
//
// So every number in this file is now DERIVED from `cosUniversityAssemblyLine.ts`, which is the one place the line's
// real cadences, concurrencies and SLAs live. Two files owning the same deadline is how a controller ends up
// disagreeing with the station it is supposedly pacing. The shape of this module is unchanged - plans keyed by
// artifact status, a deadline, a spacing rule and a stage-change test - because the route and the host monitoring
// already read it; only the source of its numbers moved.
import {
  UNIVERSITY_ASSEMBLY_LINE,
  expectedStartSeconds,
  stationForStatus,
  unitDeadlineSeconds,
  type Station,
  type StationId,
} from './cosUniversityAssemblyLine.ts'

export type UniversityLifecycleStage = StationId

export type LifecycleArtifact = Readonly<{
  candidateId: string
  artifactHash: string
  subjectId: string
  status: string
  updatedAt: string
}>

export type LifecyclePlan = Readonly<{
  stage: UniversityLifecycleStage
  nextAction: string
  /** The watchdog window for a unit at the HEAD of this station's queue. Units behind it get their queue added. */
  deadlineMs: number
  terminal: boolean
  workerPath: string | null
  /** How many units this station may hold at once, so the controller can run it at capacity. */
  concurrency: number
  batched: boolean
  /** True for a station whose units are working rather than waiting; its deadline re-arms from the last action. */
  recurring: boolean
}>

const planFor = (station: Station): LifecyclePlan => Object.freeze({
  stage: station.id,
  nextAction: station.nextAction,
  deadlineMs: unitDeadlineSeconds(station, 0) * 1000,
  terminal: station.terminal,
  workerPath: station.workerPath,
  concurrency: station.concurrency,
  batched: station.batched,
  recurring: station.recurring,
})

export const UNIVERSITY_LIFECYCLE_PLAN: Readonly<Record<string, LifecyclePlan>> = Object.freeze(
  Object.fromEntries(UNIVERSITY_ASSEMBLY_LINE.map(station => [station.sourceStatus, planFor(station)])),
)

export function lifecyclePlan(status: string): LifecyclePlan | null {
  return UNIVERSITY_LIFECYCLE_PLAN[String(status || '').trim()] ?? null
}

export function lifecycleDeadline(enteredAt: Date, plan: LifecyclePlan): Date {
  return new Date(enteredAt.getTime() + plan.deadlineMs)
}

/**
 * The queue-aware watchdog deadline.
 *
 * A unit twenty deep in a serial station is not evidence of a fault; nineteen units are ahead of it. Charging every
 * unit the flat head-of-queue deadline fills the overdue list with units nothing is wrong with, and the real stall
 * then hides inside that list. This adds the line's own arithmetic for how long the wait ahead should take.
 */
export function lifecycleDeadlineInQueue(input: {
  enteredAt: Date
  status: string
  queueAhead: number
}): Date | null {
  const station = stationForStatus(input.status)
  if (!station) return null
  if (station.terminal) return input.enteredAt
  return new Date(input.enteredAt.getTime() + unitDeadlineSeconds(station, input.queueAhead) * 1000)
}

/** When this unit's own work should begin, given what is ahead of it. Shown to the owner, never acted on. */
export function lifecycleExpectedStart(input: {
  enteredAt: Date
  status: string
  queueAhead: number
}): Date | null {
  const station = stationForStatus(input.status)
  if (!station || station.terminal) return null
  return new Date(input.enteredAt.getTime() + expectedStartSeconds(station, input.queueAhead) * 1000)
}

export function shouldOrchestrate(input: {
  now: Date
  deadlineAt: string
  terminal: boolean
  lastActionAt?: string | null
  minimumActionSpacingMs?: number
}): boolean {
  if (input.terminal) return false
  const now = input.now.getTime()
  const deadline = Date.parse(input.deadlineAt)
  if (!Number.isFinite(now) || !Number.isFinite(deadline) || now < deadline) return false
  const last = input.lastActionAt ? Date.parse(input.lastActionAt) : Number.NaN
  const spacing = input.minimumActionSpacingMs ?? 5 * 60_000
  return !Number.isFinite(last) || now - last >= spacing
}

export function stageChanged(previous: { stage: string; artifact_hash: string } | null, plan: LifecyclePlan, artifactHash: string): boolean {
  return !previous || previous.stage !== plan.stage || previous.artifact_hash !== artifactHash
}

/**
 * The anchor a unit's deadline is measured from.
 *
 * Production defect this fixes: WORKFORCE is nonterminal and its deadline was measured from arrival, so every active
 * graduate became permanently overdue the hour after it activated. The controller selected the oldest overdue unit
 * first, so a handful of working graduates sat at the head of the list forever and the canary queue behind them was
 * never reached. A station whose units are WORKING re-arms from its last action; a station whose units are WAITING
 * keeps measuring from arrival, which is the whole point of a queue watchdog.
 */
export function lifecycleDeadlineAnchor(input: {
  plan: LifecyclePlan
  enteredAt: Date
  lastActionAt?: string | null
}): Date {
  if (!input.plan.recurring) return input.enteredAt
  const last = input.lastActionAt ? Date.parse(String(input.lastActionAt)) : Number.NaN
  return Number.isFinite(last) ? new Date(last) : input.enteredAt
}
/**
 * The exact text a failed controller run logs.
 *
 * Production defect this fixes (2026-10-03, Vercel logs): the controller returned HTTP 500 every minute with
 * `{"ok":false,"error":"[object Object]"}`. Every throw site in the route rethrows a PostgREST error - a plain object
 * with message/code/details/hint, not a JavaScript Error - and `String(object)` discards all of it. The ledger stayed
 * empty for a day while the one line that named the failing query was thrown away. A controller that cannot say why
 * it stopped is not a controller; this makes the reason the log line.
 */
export function describeLifecycleFailure(error: unknown): string {
  if (error instanceof Error) return compact(error.message || error.name)
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const parts = [
      record.message ? compact(record.message) : '',
      record.code ? `code=${compact(record.code)}` : '',
      record.details ? `details=${compact(record.details)}` : '',
      record.hint ? `hint=${compact(record.hint)}` : '',
    ].filter(Boolean)
    if (parts.length) return parts.join(' ')
    try { return compact(JSON.stringify(record)) } catch { return 'unserializable_error_object' }
  }
  return compact(error) || 'unknown_error'
}

const compact = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)

/**
 * Which ledger rows to close out: units the ledger still holds open that are no longer on the line (retired, or gone).
 *
 * Only decided from a COMPLETE view. If the controller's read window was full, a live unit may simply be beyond it,
 * and closing it would be the controller inventing a departure it never observed - so a full window closes nothing.
 */
export function decideLineCloseout(input: {
  windowComplete: boolean
  liveIds: readonly string[]
  openLedgerIds: readonly string[]
}): readonly string[] {
  if (!input.windowComplete) return Object.freeze([])
  const live = new Set(input.liveIds)
  return Object.freeze([...new Set(input.openLedgerIds)].filter(id => id && !live.has(id)))
}

// end of saas/lib/ai/cos/cosUniversityLifecycleOrchestrator.ts (if this line is missing, the paste was cut short)
