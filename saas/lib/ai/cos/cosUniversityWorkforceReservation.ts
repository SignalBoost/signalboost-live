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

  return Object.freeze({
    reserve,
    pin: Object.freeze(inside.filter(g => (g.workersMax ?? 0) < 1).map(g => g.endpointId as string)),
    held: Object.freeze(inside.filter(g => (g.workersMax ?? 0) >= 1).map(g => g.endpointId as string)),
    release: Object.freeze(outside.filter(g => (g.workersMax ?? 0) >= 1).map(g => g.endpointId as string)),
    idle: Object.freeze(outside.filter(g => (g.workersMax ?? 0) < 1).map(g => g.endpointId as string)),
    unmanaged: Object.freeze(unmanaged),
  })
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
}>

/** Transport the station needs. Injected so the policy is testable without RunPod or a database. */
export type WorkforceReservationPorts = Readonly<{
  listGraduates: () => Promise<readonly WorkforceGraduate[]>
  releaseWorker: (endpointId: string) => Promise<unknown>
  pinWorker: (endpointId: string) => Promise<unknown>
}>

/** One line for a log or a dashboard: what the workforce holds and what the line got back. */
export function describeWorkforceReservation(report: WorkforceReservationReport): string {
  return `workforce reserve=${report.reserve} onCall=${report.onCall} | pinned=${report.pinned} held=${report.held} `
    + `released=${report.released} idle=${report.idle} unmanaged=${report.unmanaged}`
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
  })
}
// end of saas/lib/ai/cos/cosUniversityWorkforceReservation.ts (if this line is missing, the paste was cut short)
