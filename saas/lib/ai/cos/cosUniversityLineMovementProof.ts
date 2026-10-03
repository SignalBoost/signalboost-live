// saas/lib/ai/cos/cosUniversityLineMovementProof.ts
//
// Owner, 2026-10-02: "PLAYWRIGHT WATCHDOG - independently proves the line."
//
// This is the prover's brain. It answers one question that nothing else in the system can answer honestly:
//
//     Did the line actually move a unit, or does it only REPORT that it is working?
//
// Why it cannot read the controller's own verdict: the controller reports what it DISPATCHED. A station can be woken
// every minute, report `dispatched: true` every minute, and move nothing - which is exactly the shape of every stall
// in this pipeline's history. A heartbeat is not output. So the only acceptable evidence of a working line is the
// same unit observed at two different stations at two different times.
//
// The three verdicts, and why there are three rather than two:
//
//   proven_moving    a unit that was at station A is now at station B. The line produced output. This is the only
//                    verdict that may ever be shown to a buyer as proof.
//   line_stopped     nothing moved, AND at least one station held material for longer than that station's own SLA.
//                    Material in, nothing out, past the station's own allowance: that is a stopped line.
//   inconclusive     nothing moved and nothing is provably wrong - the sample was shorter than the line's takt time,
//                    or there was no material on the line, or every waiting unit is still inside its station's SLA.
//
// An empty line is INCONCLUSIVE, never "proven". This is the distinction that makes the prover worth running: a
// pipeline with nothing in it passes every liveness check ever written and has proved nothing at all. A prover that
// reports success on an idle line is a prover that will report success the day the line dies.
//
// Pure, no imports beyond the line definition, no database, no network, no clock of its own.
import {
  lineConstraint,
  stationById,
  type StationId,
} from './cosUniversityAssemblyLine.ts'

export const LINE_PROOF_SCHEMA_VERSION = 'cos-university-line-movement-proof-v1' as const

/** One unit's observed placement. The hash is part of its identity: a retrained artifact is a NEW unit. */
export type ObservedUnit = Readonly<{
  candidateId: string
  artifactHash: string
  station: string
  /** When this unit arrived at that station, ISO-8601. Optional; used only to age waiting material. */
  enteredAt?: string | null
}>

export type LineSample = Readonly<{
  /** When this sample was taken, ISO-8601. */
  at: string
  units: readonly ObservedUnit[]
}>

export type UnitMovement = Readonly<{
  candidateId: string
  artifactHash: string
  from: StationId | string
  to: StationId | string
}>

export type StoppedStation = Readonly<{
  station: StationId
  waiting: number
  slaSeconds: number
  /** How long the OLDEST waiting unit at this station has been there, in seconds. */
  oldestWaitSeconds: number
}>

export type LineMovementProof = Readonly<{
  schemaVersion: typeof LINE_PROOF_SCHEMA_VERSION
  verdict: 'proven_moving' | 'line_stopped' | 'inconclusive'
  reason: string
  firstSampleAt: string
  secondSampleAt: string
  elapsedSeconds: number
  /** The line's own pace. A sample shorter than this cannot prove anything either way. */
  taktSeconds: number
  unitsObserved: number
  movements: readonly UnitMovement[]
  stoppedStations: readonly StoppedStation[]
  /** True only for `proven_moving`. Nothing else may be presented as evidence the line works. */
  provenMoving: boolean
  authorityExpanded: false
}>

const parsedMs = (value: string | null | undefined): number | null => {
  if (!value) return null
  const at = Date.parse(String(value))
  return Number.isFinite(at) ? at : null
}

const unitKey = (unit: ObservedUnit): string =>
  `${String(unit.candidateId || '').trim()}:${String(unit.artifactHash || '').trim().toLowerCase()}`

const frozenProof = (over: Omit<Partial<LineMovementProof>, 'provenMoving' | 'schemaVersion' | 'authorityExpanded'> & {
  verdict: LineMovementProof['verdict']
  reason: string
}): LineMovementProof => Object.freeze({
  firstSampleAt: '',
  secondSampleAt: '',
  elapsedSeconds: 0,
  taktSeconds: 0,
  unitsObserved: 0,
  movements: Object.freeze([]),
  stoppedStations: Object.freeze([]),
  ...over,
  // Derived last, and not accepted from the caller at all, so `provenMoving` can never disagree with the verdict
  // it is supposed to summarise. That one boolean is what anything downstream will read as "the line works".
  schemaVersion: LINE_PROOF_SCHEMA_VERSION,
  provenMoving: over.verdict === 'proven_moving',
  authorityExpanded: false as const,
})

/**
 * Pure: compare two samples of the line and decide whether it demonstrably moved anything.
 *
 * A unit counts as moved only when the SAME candidate and artifact hash is seen at a DIFFERENT station in the second
 * sample. A unit that disappeared between samples does not count: it may have left the line, been retired, or simply
 * fallen outside a bounded read, and "it is no longer where it was" is not the same claim as "it moved forward".
 */
export function proveLineMovement(input: {
  first: LineSample
  second: LineSample
  /** Defaults to the line's own takt time. Below this, a no-movement sample is inconclusive, never a stop. */
  minimumIntervalSeconds?: number
}): LineMovementProof {
  const firstAt = parsedMs(input.first?.at)
  const secondAt = parsedMs(input.second?.at)
  const takt = lineConstraint()?.taktSeconds ?? 0
  const base = {
    firstSampleAt: String(input.first?.at || ''),
    secondSampleAt: String(input.second?.at || ''),
    taktSeconds: takt,
    unitsObserved: (input.second?.units || []).length,
  }

  if (firstAt === null || secondAt === null) {
    return frozenProof({ ...base, verdict: 'inconclusive', reason: 'sample_timestamps_unreadable' })
  }
  const elapsedSeconds = Math.floor((secondAt - firstAt) / 1000)
  if (elapsedSeconds <= 0) {
    return frozenProof({ ...base, verdict: 'inconclusive', reason: 'samples_not_separated_in_time', elapsedSeconds })
  }

  const before = new Map<string, ObservedUnit>()
  for (const unit of input.first.units || []) {
    const key = unitKey(unit)
    if (key.length > 1) before.set(key, unit)
  }

  const movements: UnitMovement[] = []
  for (const unit of input.second.units || []) {
    const previous = before.get(unitKey(unit))
    if (!previous) continue
    const from = String(previous.station || '')
    const to = String(unit.station || '')
    if (!from || !to || from === to) continue
    movements.push(Object.freeze({
      candidateId: String(unit.candidateId),
      artifactHash: String(unit.artifactHash || '').toLowerCase(),
      from,
      to,
    }))
  }

  if (movements.length) {
    return frozenProof({
      ...base,
      verdict: 'proven_moving',
      reason: `observed_${movements.length}_unit_station_change`,
      elapsedSeconds,
      movements: Object.freeze(movements),
    })
  }

  // Nothing moved. Before that can be called a stop, the sample has to have been long enough to expect movement.
  const minimumInterval = Number.isFinite(input.minimumIntervalSeconds as number) && (input.minimumIntervalSeconds as number) > 0
    ? Math.floor(input.minimumIntervalSeconds as number)
    : takt
  if (minimumInterval > 0 && elapsedSeconds < minimumInterval) {
    return frozenProof({
      ...base,
      verdict: 'inconclusive',
      reason: `sample_shorter_than_takt_${minimumInterval}s`,
      elapsedSeconds,
    })
  }

  // An idle line proves nothing. It is not a failure and it is certainly not a success.
  const secondUnits = input.second.units || []
  if (!secondUnits.length) {
    return frozenProof({ ...base, verdict: 'inconclusive', reason: 'no_material_on_the_line', elapsedSeconds })
  }

  // Material present and nothing moved: a stop only where a station has held its oldest unit past its own SLA.
  const oldestByStation = new Map<string, { waiting: number; oldest: number | null }>()
  for (const unit of secondUnits) {
    const stationId = String(unit.station || '')
    if (!stationId) continue
    const entry = oldestByStation.get(stationId) || { waiting: 0, oldest: null }
    entry.waiting += 1
    const entered = parsedMs(unit.enteredAt ?? null)
    if (entered !== null && (entry.oldest === null || entered < entry.oldest)) entry.oldest = entered
    oldestByStation.set(stationId, entry)
  }

  const stopped: StoppedStation[] = []
  for (const [stationId, entry] of oldestByStation) {
    const station = stationById(stationId)
    if (!station || station.terminal || station.stationSlaSeconds <= 0) continue
    // No readable arrival clock means no claim. An unreadable timestamp is a reason to look, not evidence of a stop.
    if (entry.oldest === null) continue
    const waited = Math.floor((secondAt - entry.oldest) / 1000)
    if (waited <= station.stationSlaSeconds) continue
    stopped.push(Object.freeze({
      station: station.id,
      waiting: entry.waiting,
      slaSeconds: station.stationSlaSeconds,
      oldestWaitSeconds: waited,
    }))
  }

  if (stopped.length) {
    return frozenProof({
      ...base,
      verdict: 'line_stopped',
      reason: `material_waiting_past_sla_at_${stopped.map(entry => entry.station).join(',')}`,
      elapsedSeconds,
      stoppedStations: Object.freeze(stopped),
    })
  }

  return frozenProof({
    ...base,
    verdict: 'inconclusive',
    reason: 'nothing_moved_but_every_station_is_inside_its_sla',
    elapsedSeconds,
  })
}

/**
 * Turn a controller line-state response into a sample.
 *
 * Deliberately tolerant about shape and deliberately strict about identity: a unit with no candidate id, no artifact
 * hash or no station is dropped rather than guessed at, because a half-identified unit is what makes a prover report
 * movement that did not happen.
 */
export function sampleFromLineState(input: { at: string; units: unknown }): LineSample {
  const rows = Array.isArray(input.units) ? input.units : []
  const units: ObservedUnit[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const candidateId = String(record.candidateId ?? record.candidate_id ?? '').trim()
    const artifactHash = String(record.artifactHash ?? record.artifact_hash ?? '').trim().toLowerCase()
    const station = String(record.station ?? record.stage ?? '').trim()
    if (!candidateId || !artifactHash || !station) continue
    const enteredRaw = record.enteredAt ?? record.stage_entered_at ?? record.entered_at ?? null
    units.push(Object.freeze({
      candidateId,
      artifactHash,
      station,
      enteredAt: enteredRaw === null || enteredRaw === undefined ? null : String(enteredRaw),
    }))
  }
  return Object.freeze({ at: String(input.at || ''), units: Object.freeze(units) })
}

/** One line a human or a buyer can read off the proof without interpreting it. */
export function describeLineProof(proof: LineMovementProof): string {
  if (proof.verdict === 'proven_moving') {
    const first = proof.movements[0]
    const example = first ? ` (e.g. ${first.candidateId} ${first.from} -> ${first.to})` : ''
    return `PROVEN: the line moved ${proof.movements.length} unit(s) in ${proof.elapsedSeconds}s${example}.`
  }
  if (proof.verdict === 'line_stopped') {
    return `STOPPED: nothing moved in ${proof.elapsedSeconds}s while ${proof.stoppedStations
      .map(entry => `${entry.station} held ${entry.waiting} unit(s) for ${entry.oldestWaitSeconds}s against a ${entry.slaSeconds}s SLA`)
      .join('; ')}.`
  }
  return `NOT PROVEN: ${proof.reason} after ${proof.elapsedSeconds}s. This is not evidence the line works.`
}
// end of saas/lib/ai/cos/cosUniversityLineMovementProof.ts (if this line is missing, the paste was cut short)