// saas/lib/ai/cos/cosUniversityWorkforceReservation.ts
//
// The workforce's share of the worker pool is a RESERVATION, enforced every tick - not a hope.
//
// Production 2026-10-03 20:21 UTC, RunPod's own words, six times in ninety minutes to the independent evaluator:
//
//     "Max workers across all endpoints must not exceed your workers quota (10) ... lower the max worker count for
//      this endpoint to at most 0. quota_inventory=holders=10:reserved=10:led-...(1/1,protected),led-...(1/1,protected)"
//
// Every one of the ten slots was held by a protected endpoint: an active graduate, activated with max=1 on its own
// endpoint and left there for good. Seventeen graduates were active. The capacity model declared the workforce share
// as 2 of 10 workers, but nothing enforced it: activation only ever added a pinned worker, so the workforce grew
// until it owned the whole account and the line behind it - canary, examiner - was told "at most 0".
//
// This module makes the declared share real. Each tick the workforce station ranks its on-call graduates, keeps the
// `workforce` most recently useful ones pinned (max=1: a held slot, still scale-to-zero, no standing spend), and
// releases every other graduate's reservation (max=0). A released graduate stays active and on the roster; it is
// simply off until the reservation rotates it back in. That is consistent with the owner's standing rule of
// 2026-10-02 - NO PAID WAKE-UPS - because a graduate whose endpoint is off is already skipped by the warm gate and
// gets no work until it is pinned again. Pinning holds a slot; it boots nothing.
//
// Releases run before pins, so a rotation never asks RunPod for an eleventh slot. Nothing here deletes an endpoint,
// changes a graduate's status, widens authority or spends money.
import { lineCapacity } from './cosUniversityLineCapacity.ts'

export type WorkforceGraduate = Readonly<{
  registryId: string
  /** The graduate's RunPod serverless endpoint id, or null when its runtime is not a RunPod endpoint. */
  endpointId: string | null
  /** The endpoint's current max-worker reservation as RunPod reports it; null when the endpoint was not found. */
  workersMax: number | null
  /** The endpoint's current min workers: 1 means a worker is kept running (warm), 0 means scale-to-zero. */
  workersMin: number | null
  /** When this graduate last served or attempted real work. Null means never. */
  lastAttemptAt: string | null
}>

export type WorkforceReservationDecision = Readonly<{
  /** How many graduates may hold a pinned worker: the declared workforce share of the pool. */
  reserve: number
  /** Endpoints to raise to max=1 this tick (ranked inside the reserve but currently released). */
  pin: readonly string[]
  /** Endpoints to lower to max=0 this tick (outside the reserve but currently holding a slot). */
  release: readonly string[]
  /** Ranked inside the reserve and already pinned - nothing to do. */
  held: readonly string[]
  /** Outside the reserve and already released - nothing to do. */
  idle: readonly string[]
  /** Graduates with no RunPod endpoint, or an endpoint RunPod did not list. Reported, never touched. */
  unmanaged: readonly string[]
  /**
   * Registry ids of the graduates ranked INSIDE the reserve - the only ones that may receive work this tick.
   *
   * Production 2026-10-04 00:15-02:15 UTC: 14 practice tasks on 7 freshly activated graduates all timed out at 45 s
   * with the endpoint measured `cold` afterwards. The reconcile had just released those graduates to max=0 (never
   * served, so ranked last); their workers, still warm from their own canary, reported idle for a few more seconds;
   * the warm gate passed; RunPod then terminated the worker mid-request. A released graduate is OFF by decision and
   * must never be handed a task, whatever its health endpoint says in the seconds after release.
   */
  eligibleForWork: readonly string[]
  /** Every other on-call graduate: released, idle or unmanaged. Excluded from work this tick. */
  excludedFromWork: readonly string[]
}>

const at = (value: string | null): number => {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

/**
 * Pure: who holds a worker this tick.
 *
 * Ranking is "most recently useful first": a graduate that served or attempted work most recently keeps its slot;
 * one that has never been asked for anything is the first to give its slot back. Ties break on registry id, so the
 * decision is deterministic across ticks and across concurrent runs.
 */
export function decideWorkforceReservation(input: {
  graduates: readonly WorkforceGraduate[]
  reserve: number
}): WorkforceReservationDecision {
  const reserve = Math.max(0, Math.floor(Number(input.reserve) || 0))
  const managed = input.graduates.filter(g => g.endpointId && g.workersMax !== null)
  const unmanaged = input.graduates.filter(g => !g.endpointId || g.workersMax === null).map(g => g.registryId)

  const ranked = [...managed].sort((a, b) => at(b.lastAttemptAt) - at(a.lastAttemptAt) || a.registryId.localeCompare(b.registryId))
  const inside = ranked.slice(0, reserve)
  const outside = ranked.slice(reserve)
  const eligible = new Set(inside.map(g => g.registryId))

  return Object.freeze({
    reserve,
    eligibleForWork: Object.freeze(inside.map(g => g.registryId)),
    excludedFromWork: Object.freeze([...new Set(input.graduates.map(g => g.registryId))].filter(id => !eligible.has(id)).sort()),
    pin: Object.freeze(inside.filter(g => (g.workersMax ?? 0) < 1).map(g => g.endpointId as string)),
    held: Object.freeze(inside.filter(g => (g.workersMax ?? 0) >= 1).map(g => g.endpointId as string)),
    release: Object.freeze(outside.filter(g => (g.workersMax ?? 0) >= 1).map(g => g.endpointId as string)),
    idle: Object.freeze(outside.filter(g => (g.workersMax ?? 0) < 1).map(g => g.endpointId as string)),
    unmanaged: Object.freeze(unmanaged),
  })
}

/**
 * The daily window in which the reserved graduates are kept WARM (min=1), declared as `HH:MM-HH:MM` in UTC.
 *
 * Owner 2026-10-03, choosing among "keep the reserve warm always", "never pay to wake", and "scheduled warm windows":
 * "my first objective is to prove that the software works as designed so I can sell it - option 3". A graduate only
 * does work while its worker is running, and the standing NO PAID WAKE-UPS rule forbids booting one for a task, so on a
 * test rig with no users the workforce produced nothing (20 attempts in 7 hours, all timeouts). Inside the window the
 * reserved graduates run; practice work flows; served -> verified outcomes land in each graduate's permanent ledger.
 * Outside it they return to scale-to-zero with their slot kept. Unset means no window: today's behavior, no spend.
 * A window may cross midnight ("22:00-02:00"). Anything unparseable is treated as unset and reported.
 */
export const WORKFORCE_WARM_WINDOW_ENV = 'COS_UNIVERSITY_WORKFORCE_WARM_WINDOW' as const

export type WarmWindow = Readonly<{ startMinute: number; endMinute: number; declared: string }>

const WINDOW_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/

/** Parse `HH:MM-HH:MM` (UTC). Null when unset or unusable; a zero-length window is unusable. */
export function parseWarmWindow(raw: unknown): WarmWindow | null {
  const value = String(raw ?? '').trim()
  const match = WINDOW_PATTERN.exec(value)
  if (!match) return null
  const startMinute = Number(match[1]) * 60 + Number(match[2])
  const endMinute = Number(match[3]) * 60 + Number(match[4])
  if (startMinute === endMinute) return null
  return Object.freeze({ startMinute, endMinute, declared: value })
}

export type WarmWindowSource = 'setting' | 'env' | 'none'

export type WarmWindowResolution = Readonly<{ window: WarmWindow | null; source: WarmWindowSource }>

/**
 * Which window applies: the buyer's stored setting first (owner 2026-10-04: "any other settings/configuration
 * regarding the portable should be with the University telemetry"), the environment declaration as the fallback for
 * a deployment that has stored nothing, otherwise none. A stored value that does not parse counts as none - it is
 * reported, never guessed at - and does NOT fall through to the environment, because the buyer's last word was to
 * set something, not to revert.
 */
export function resolveWarmWindow(input: {
  setting: string | null | undefined
  env: Record<string, string | undefined>
}): WarmWindowResolution {
  const stored = String(input.setting ?? '').trim()
  if (stored) return Object.freeze({ window: parseWarmWindow(stored), source: 'setting' as const })
  const fromEnv = parseWarmWindow(input.env[WORKFORCE_WARM_WINDOW_ENV])
  return Object.freeze({ window: fromEnv, source: fromEnv ? 'env' as const : 'none' as const })
}

/** When the window next opens or closes after `now`, for an operations page that shows the schedule in local time. */
export function nextWarmWindowChange(window: WarmWindow, now: Date): Readonly<{ opensAt: string | null; closesAt: string | null }> {
  const at = (minute: number, dayOffset: number) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, Math.floor(minute / 60), minute % 60))
    return d
  }
  const next = (minute: number) => {
    const today = at(minute, 0)
    return (today.getTime() > now.getTime() ? today : at(minute, 1)).toISOString()
  }
  return inWarmWindow(window, now)
    ? Object.freeze({ opensAt: null, closesAt: next(window.endMinute) })
    : Object.freeze({ opensAt: next(window.startMinute), closesAt: null })
}

/** True when `now` (UTC) falls inside the window; a window that crosses midnight wraps. */
export function inWarmWindow(window: WarmWindow, now: Date): boolean {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes()
  return window.startMinute < window.endMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute
}

export type WorkforceReservationReport = Readonly<{
  reserve: number
  onCall: number
  pinned: number
  released: number
  held: number
  idle: number
  unmanaged: number
  /** Slot changes RunPod refused, with the endpoint and the message. Reported, never retried inside the tick. */
  errors: readonly string[]
  deadlineReached: boolean
  /** Registry ids that may receive work this tick: exactly the graduates ranked inside the reserve. */
  eligibleForWork: readonly string[]
  /** Registry ids that must not receive work this tick. */
  excludedFromWork: readonly string[]
  /** False when the reconcile itself failed, so the station knows nothing about who holds a slot and gives out no work. */
  eligibilityKnown: boolean
  /** The declared warm window, or null when none is declared (or the declaration was unusable). */
  window: string | null
  /** Where the window came from: the buyer's stored setting, the environment fallback, or nowhere. */
  windowSource: WarmWindowSource
  /** Whether this tick fell inside the window. Null when no window is declared. */
  inWindow: boolean | null
  /** Reserved graduates set to min=1 this tick. */
  warmed: number
  /** Reserved graduates returned to min=0 this tick. */
  cooled: number
}>

/** Transport the station needs. Injected so the policy is testable without RunPod or a database. */
export type WorkforceReservationPorts = Readonly<{
  listGraduates: () => Promise<readonly WorkforceGraduate[]>
  releaseWorker: (endpointId: string) => Promise<unknown>
  pinWorker: (endpointId: string) => Promise<unknown>
  /** min=1/max=1: keep one worker running. Only ever applied to a graduate inside the reserve, inside the window. */
  warmWorker: (endpointId: string) => Promise<unknown>
  /** min=0/max=1: back to scale-to-zero, slot kept. */
  coolWorker: (endpointId: string) => Promise<unknown>
}>

/** One line for a log or a dashboard: what the workforce holds and what the line got back. */
export function describeWorkforceReservation(report: WorkforceReservationReport): string {
  return `workforce reserve=${report.reserve} onCall=${report.onCall} | pinned=${report.pinned} held=${report.held} `
    + `released=${report.released} idle=${report.idle} unmanaged=${report.unmanaged}`
    + ` | eligibleForWork=${report.eligibilityKnown ? report.eligibleForWork.length : 'unknown'}`
    + (report.window
      ? ` | window=${report.window} windowSource=${report.windowSource} inWindow=${report.inWindow} warmed=${report.warmed} cooled=${report.cooled}`
      : ` | window=none windowSource=${report.windowSource}`)
    + (report.errors.length ? ` | refused=${report.errors.length}` : '')
    + (report.deadlineReached ? ' | deadline_reached' : '')
}

/**
 * Enforce the reservation once. Releases first, then pins, each bounded by the deadline; a refused change is recorded
 * and the tick continues, so one bad endpoint cannot stop the others from giving their slots back.
 */
export async function reconcileWorkforceReservation(input: {
  ports: WorkforceReservationPorts
  deadlineMs?: number
  env?: Record<string, string | undefined>
  /** The clock the window is judged by. Injected for tests; the station passes nothing and gets the real time. */
  now?: Date
  /** The buyer's stored warm window (raw), read by the station through its settings adapter. Undefined = none stored. */
  warmWindowSetting?: string | null
}): Promise<WorkforceReservationReport> {
  const reserve = lineCapacity(input.env || process.env).workforce
  const graduates = await input.ports.listGraduates()
  const decision = decideWorkforceReservation({ graduates, reserve })
  const deadline = Number.isFinite(input.deadlineMs) ? Number(input.deadlineMs) : null
  const errors: string[] = []
  let released = 0
  let pinned = 0
  let deadlineReached = false

  const apply = async (ids: readonly string[], act: (id: string) => Promise<unknown>, verb: string) => {
    let done = 0
    for (const id of ids) {
      if (deadline !== null && Date.now() >= deadline) { deadlineReached = true; break }
      try { await act(id); done += 1 }
      catch (error) { errors.push(`${verb}:${id}:${String(error instanceof Error ? error.message : error).replace(/\s+/g, ' ').slice(0, 160)}`) }
    }
    return done
  }
  released = await apply(decision.release, input.ports.releaseWorker, 'release')
  pinned = await apply(decision.pin, input.ports.pinWorker, 'pin')

  // Warm window: only the graduates inside the reserve, only while the window is open. Everyone else was released above
  // and never reaches this step, so a warm worker can only ever belong to a reserved graduate.
  const resolved = resolveWarmWindow({ setting: input.warmWindowSetting, env: input.env || process.env })
  const window = resolved.window
  const now = input.now ?? new Date()
  const inWindow = window ? inWarmWindow(window, now) : null
  let warmed = 0
  let cooled = 0
  if (window) {
    const reserved = graduates.filter(g => decision.eligibleForWork.includes(g.registryId) && g.endpointId)
    if (inWindow) {
      warmed = await apply(reserved.filter(g => (g.workersMin ?? 0) < 1).map(g => g.endpointId as string), input.ports.warmWorker, 'warm')
    } else {
      cooled = await apply(reserved.filter(g => (g.workersMin ?? 0) >= 1).map(g => g.endpointId as string), input.ports.coolWorker, 'cool')
    }
  }

  return Object.freeze({
    reserve,
    onCall: graduates.length,
    pinned,
    released,
    held: decision.held.length,
    idle: decision.idle.length,
    unmanaged: decision.unmanaged.length,
    errors: Object.freeze(errors.slice(0, 20)),
    deadlineReached,
    eligibleForWork: decision.eligibleForWork,
    excludedFromWork: decision.excludedFromWork,
    eligibilityKnown: true,
    window: window ? window.declared : null,
    windowSource: resolved.source,
    inWindow,
    warmed,
    cooled,
  })
}

/** The report when the reconcile itself could not run: nothing is known, so nobody is eligible for work. */
export function unknownWorkforceReservation(error: unknown): WorkforceReservationReport {
  return Object.freeze({
    reserve: 0, onCall: 0, pinned: 0, released: 0, held: 0, idle: 0, unmanaged: 0, deadlineReached: false,
    errors: Object.freeze([`reconcile:${String(error instanceof Error ? error.message : error).replace(/\s+/g, ' ').slice(0, 160)}`]),
    eligibleForWork: Object.freeze([]),
    excludedFromWork: Object.freeze([]),
    eligibilityKnown: false,
    window: null,
    windowSource: 'none',
    inWindow: null,
    warmed: 0,
    cooled: 0,
  })
}
// end of saas/lib/ai/cos/cosUniversityWorkforceReservation.ts (if this line is missing, the paste was cut short)
