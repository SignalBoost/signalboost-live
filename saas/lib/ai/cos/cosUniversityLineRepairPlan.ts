// saas/lib/ai/cos/cosUniversityLineRepairPlan.ts
//
// Owner, 2026-10-02: "self healing supervisor never proved that it works, and you want it to be responsible for the
// whole thing?"
//
// He was right, and this file fixes a defect I introduced. When the lifecycle stall watcher was wired into the
// distillation monitor, its four reasons were added to the snapshot and to the critical list - but nothing checked
// what the governed REPAIR does when it receives one. Read in sequence, the live code does this:
//
//   1. the monitor raises `lifecycle_quarantine_stalled`, so `state` becomes `repair_required` and
//      `automaticRecoveryAuthorized` becomes true
//   2. `recoverUniversityMassDistillation` runs `runCosUniversityMassDistillationWorkflow` - the TRAINING workflow,
//      which is entirely upstream of the artifact existing. It cannot move a student out of quarantine, cannot run
//      an exam, cannot register a graduate
//   3. it re-reads health, the lifecycle reason is still there, so it THROWS
//      `university_distillation_recovery_verification_failed:lifecycle_quarantine_stalled`
//
// Every five minutes, forever: paid training that cannot fix the fault, followed by a self-inflicted verification
// failure. That is worse than doing nothing, and it is exactly the "never proved that it works" pattern.
//
// This module is the missing routing. It is pure, decides no repair itself, and spends nothing. It answers one
// question - which repair can actually address these reasons - and it is explicit about the one thing a supervisor
// must never fake: a line repair wakes a station, and a station's work takes MINUTES. Reading health one second
// later and demanding the reason be gone is a verification designed to fail. So a line repair reports
// `verificationDeferred`, with the station's own SLA as the clock, and is never recorded as a verified fix.
import { stationById, type Station, type StationId } from './cosUniversityAssemblyLine.ts'

export const LINE_REPAIR_AUTHORIZATION_REF =
  'owner_explicit_direction_2026-10-02_repair_what_is_actually_stalled' as const

/** The four reasons the lifecycle watcher can raise. Everything else is upstream of the line. */
export const LINE_REPAIR_REASONS = Object.freeze([
  'lifecycle_exam_stalled',
  'lifecycle_quarantine_stalled',
  'lifecycle_registration_stalled',
  'lifecycle_activation_stalled',
] as const)

export type LineRepairReason = typeof LINE_REPAIR_REASONS[number]

/**
 * Which station each stall belongs to.
 *
 * `lifecycle_activation_stalled` maps to GRADUATION because activation lives inside the graduate-activation route,
 * behind its own owner flag. Waking that route is the only action available; whether activation then proceeds stays
 * entirely that route's decision.
 */
const REASON_STATION: Readonly<Record<LineRepairReason, StationId>> = Object.freeze({
  lifecycle_exam_stalled: 'INDEPENDENT_EVALUATION',
  lifecycle_quarantine_stalled: 'QUARANTINE_REMEDIATION',
  lifecycle_registration_stalled: 'GRADUATION',
  lifecycle_activation_stalled: 'GRADUATION',
})

export type LineRepairTarget = 'none' | 'assembly_line' | 'training_workflow' | 'both'

export type LineRepairStation = Readonly<{
  station: StationId
  workerPath: string
  /** The station's own SLA, which is the clock a deferred verification must wait out. */
  slaSeconds: number
  reasons: readonly LineRepairReason[]
}>

export type LineRepairPlan = Readonly<{
  target: LineRepairTarget
  /** Stations to wake, deduplicated and in line order. Empty unless the target includes the assembly line. */
  stations: readonly LineRepairStation[]
  lineReasons: readonly LineRepairReason[]
  /** Everything the training workflow is the right repair for. */
  upstreamReasons: readonly string[]
  /**
   * True whenever a station was woken. A station's work takes minutes, so the fault cannot be confirmed gone in the
   * same request. The repair is real; the CONFIRMATION waits for the station's SLA. Never report it as verified.
   */
  verificationDeferred: boolean
  /** The longest station SLA involved: the earliest a later tick may honestly call this repair failed. */
  deferredForSeconds: number
  reason: string
  authorityExpanded: false
}>

const isLineReason = (value: unknown): value is LineRepairReason =>
  (LINE_REPAIR_REASONS as readonly string[]).includes(String(value))

/**
 * Pure: split a health snapshot's reasons into what the line can repair and what training can repair.
 *
 * Unknown reasons are treated as UPSTREAM, never dropped. A reason nobody recognises must still reach the repair
 * that exists, rather than being silently excluded because this module has not heard of it.
 */
export function lineRepairPlan(input: { reasons: readonly string[] }): LineRepairPlan {
  const seen = new Set<string>()
  const lineReasons: LineRepairReason[] = []
  const upstreamReasons: string[] = []
  for (const raw of input.reasons || []) {
    const reason = String(raw || '').trim()
    if (!reason || seen.has(reason)) continue
    seen.add(reason)
    if (isLineReason(reason)) lineReasons.push(reason)
    else upstreamReasons.push(reason)
  }

  const byStation = new Map<StationId, { station: Station; reasons: LineRepairReason[] }>()
  for (const reason of lineReasons) {
    const stationId = REASON_STATION[reason]
    const station = stationById(stationId)
    // A reason whose station has no worker cannot be repaired by waking anything, so it is not claimed here.
    if (!station || station.terminal || !station.workerPath) continue
    const entry = byStation.get(stationId) || { station, reasons: [] }
    entry.reasons.push(reason)
    byStation.set(stationId, entry)
  }

  const stations: LineRepairStation[] = [...byStation.values()].map(entry => Object.freeze({
    station: entry.station.id,
    workerPath: entry.station.workerPath as string,
    slaSeconds: entry.station.stationSlaSeconds,
    reasons: Object.freeze([...entry.reasons]),
  }))

  const target: LineRepairTarget = stations.length && upstreamReasons.length
    ? 'both'
    : stations.length
      ? 'assembly_line'
      : upstreamReasons.length
        ? 'training_workflow'
        : 'none'

  const deferredForSeconds = stations.reduce((longest, entry) => Math.max(longest, entry.slaSeconds), 0)

  return Object.freeze({
    target,
    stations: Object.freeze(stations),
    lineReasons: Object.freeze(lineReasons),
    upstreamReasons: Object.freeze(upstreamReasons),
    verificationDeferred: stations.length > 0,
    deferredForSeconds,
    reason: target === 'none'
      ? 'nothing_to_repair'
      : target === 'assembly_line'
        ? `wake_${stations.map(entry => entry.station).join(',')}`
        : target === 'training_workflow'
          ? `training_workflow_for_${upstreamReasons.join(',')}`
          : `wake_${stations.map(entry => entry.station).join(',')}_then_training_workflow`,
    authorityExpanded: false as const,
  })
}

/**
 * Whether a snapshot's remaining reasons are ONLY line stalls that a just-dispatched repair has not had time to
 * clear. True means a verification failure would be a lie about elapsed time, not a finding.
 */
export function onlyDeferredLineReasonsRemain(input: { reasons: readonly string[] }): boolean {
  const remaining = (input.reasons || []).map(reason => String(reason || '').trim()).filter(Boolean)
  if (!remaining.length) return false
  return remaining.every(isLineReason)
}

// ---------------------------------------------------------------------------------------------------------------
// The repair itself, with every side effect injected.
//
// This sits here rather than in the host adapter for one practical reason: it is the part worth PROVING, and the
// host adapter cannot be imported into a test without dragging the whole training workflow's module graph with it.
// Everything consequential - waking a station, writing a receipt, re-reading health - arrives as a parameter, so
// the sequence and the honesty of its verdict are testable on their own.
// ---------------------------------------------------------------------------------------------------------------

export type StationWakeResult = Readonly<{ ok: boolean; status?: number; detail?: string }>

export type WokenStation = Readonly<{
  station: StationId
  workerPath: string
  woken: boolean
  detail: string
  reasons: readonly string[]
}>

export type LineRepairOutcome = Readonly<{
  attempted: boolean
  /** True only when health came back clean. A woken station that is still working is never "settled". */
  settled: boolean
  /** True when the repair was dispatched and its confirmation belongs to a later tick. */
  verificationDeferred: boolean
  deferredForSeconds: number
  /** True when nothing paid should run this tick: the line was the whole fault. */
  paidDispatchSuppressed: boolean
  stations: readonly WokenStation[]
  plan: LineRepairPlan
  receiptRef: string | null
  remainingReasons: readonly string[]
  authorityExpanded: false
}>

/**
 * Wake the stations a line stall belongs to, record it, and report honestly whether anything is confirmed.
 *
 * Zero spend: waking a station is an authenticated call to a cron path that already exists. Every quality,
 * admission, promotion and spend decision stays inside that station - this only ensures it is awake while it holds
 * work. It is the repair for a `lifecycle_*_stalled` reason, in place of running the TRAINING workflow at it, which
 * is upstream of the artifact existing and can clear none of these faults.
 */
export async function runLineStationRepair(input: {
  reasons: readonly string[]
  wake: (args: { path: string }) => Promise<StationWakeResult>
  readHealth: () => Promise<{ state: string; reasons: readonly string[] }>
  recordReceipt?: (args: { stations: readonly WokenStation[]; plan: LineRepairPlan }) => Promise<string | null>
}): Promise<LineRepairOutcome> {
  const plan = lineRepairPlan({ reasons: input.reasons })
  const idle = (remaining: readonly string[]): LineRepairOutcome => Object.freeze({
    attempted: false,
    settled: false,
    verificationDeferred: false,
    deferredForSeconds: 0,
    paidDispatchSuppressed: false,
    stations: Object.freeze([]),
    plan,
    receiptRef: null,
    remainingReasons: Object.freeze([...remaining]),
    authorityExpanded: false as const,
  })
  if (!plan.stations.length) return idle(input.reasons || [])

  const stations: WokenStation[] = await Promise.all(plan.stations.map(async entry => {
    let result: StationWakeResult = { ok: false, detail: 'station_wake_threw' }
    try {
      result = await input.wake({ path: entry.workerPath })
    } catch (error) {
      result = { ok: false, detail: error instanceof Error ? error.message : 'station_wake_threw' }
    }
    return Object.freeze({
      station: entry.station,
      workerPath: entry.workerPath,
      woken: result.ok === true,
      detail: String(result.detail || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      reasons: entry.reasons,
    })
  }))

  const receiptRef = input.recordReceipt
    ? await input.recordReceipt({ stations, plan }).catch(() => null)
    : null

  const after = await input.readHealth()
  const remainingReasons = (after?.reasons || []).map(reason => String(reason || '').trim()).filter(Boolean)
  const settled = String(after?.state || '') !== 'repair_required'
  const onlyLineLeft = onlyDeferredLineReasonsRemain({ reasons: remainingReasons })

  return Object.freeze({
    attempted: true,
    settled,
    // Deferred exactly when the repair ran and the only thing still outstanding is a station that needs time.
    verificationDeferred: !settled && onlyLineLeft,
    deferredForSeconds: settled ? 0 : plan.deferredForSeconds,
    // The paid path has nothing to contribute when the line was the whole fault, or when all that remains is a
    // station already working on it.
    paidDispatchSuppressed: settled || onlyLineLeft,
    stations: Object.freeze(stations),
    plan,
    receiptRef,
    remainingReasons: Object.freeze(remainingReasons),
    authorityExpanded: false as const,
  })
}
// end of saas/lib/ai/cos/cosUniversityLineRepairPlan.ts (if this line is missing, the paste was cut short)
