// saas/lib/ai/cos/cosUniversityLineObservation.ts
//
// The assembly line, observed without being driven. Owner, 2026-10-06.
//
// The outside prover (tests/cosUniversityAssemblyLine.playwright.spec.ts) used to read placement from the controller
// route. That route RUNS a controller tick on every call: it reconciles the ledger, leases units and wakes stations.
// A prover that drives the line it measures is not independent, so the prover now reads this observation instead.
//
// Placement comes from the raw artifact status (the source of truth). The lifecycle ledger the controller writes is
// read only for timing (when a unit entered its station, when a station last produced output, live leases) and to
// report how many units the ledger currently places at a different station than the artifact table.
//
// Pure: the route reads the rows and passes them in, so the arithmetic is testable without a database.
import {
  WORKING_STATIONS,
  decideLineStops,
  leaseIsLive,
  isAssemblyLineCandidate,
  stationForStatus,
  type LineStop,
  type StationReading,
} from './cosUniversityAssemblyLine.ts'

export const LINE_OBSERVATION_SCHEMA_VERSION = 'cos-university-assembly-line-observation-v1' as const

export type ObservedArtifactRow = Readonly<{
  candidate_id?: unknown
  trained_artifact_hash?: unknown
  status?: unknown
  updated_at?: unknown
}>

export type ObservedLedgerRow = Readonly<{
  candidate_id?: unknown
  station?: unknown
  stage_entered_at?: unknown
  last_transition_at?: unknown
  lease_until?: unknown
  terminal?: unknown
}>

export type ObservedUnit = Readonly<{
  candidateId: string
  artifactHash: string
  station: string
  sourceStatus: string
  enteredAt: string
  /** Where the controller's ledger places this unit; null when the ledger has no open row for it. */
  ledgerStation: string | null
}>

export type LineObservation = Readonly<{
  units: readonly ObservedUnit[]
  line: readonly Readonly<{ station: string; status: string; waiting: number; inFlight: number; stationSlaSeconds: number }>[]
  lineStops: readonly LineStop[]
  /** Units whose ledger station differs from the station their artifact status implies (controller lag or defect). */
  ledgerDisagreements: number
  /** Units with no open ledger row at all. */
  ledgerMissing: number
}>

const text = (value: unknown, max = 240): string => String(value ?? '').trim().slice(0, max)

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const ms = Date.parse(String(value))
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

export function observeLine(input: {
  artifacts: readonly ObservedArtifactRow[]
  ledger: readonly ObservedLedgerRow[]
  now: Date
}): LineObservation {
  const now = input.now
  const nowIso = now.toISOString()
  const ledgerById = new Map<string, ObservedLedgerRow>()
  for (const row of input.ledger) {
    if (row.terminal === true) continue
    const id = text(row.candidate_id)
    if (id) ledgerById.set(id, row)
  }

  const units: ObservedUnit[] = []
  let ledgerDisagreements = 0
  let ledgerMissing = 0
  for (const raw of input.artifacts) {
    const candidateId = text(raw.candidate_id)
    const artifactHash = text(raw.trained_artifact_hash, 128).toLowerCase()
    const sourceStatus = text(raw.status, 60)
    const station = stationForStatus(sourceStatus)
    if (!candidateId || !artifactHash || !station || station.terminal) continue
    if (!isAssemblyLineCandidate(candidateId)) continue
    const ledger = ledgerById.get(candidateId) || null
    const ledgerStation = ledger ? text(ledger.station, 60) || null : null
    if (!ledger) ledgerMissing += 1
    else if (ledgerStation !== String(station.id)) ledgerDisagreements += 1
    // The ledger's entry time is only trusted while it agrees on the station; otherwise the artifact moved after the
    // controller last reconciled, and its own updated_at is the best available arrival time.
    const enteredAt = (ledgerStation === String(station.id) ? isoOrNull(ledger?.stage_entered_at) : null)
      || isoOrNull(raw.updated_at)
      || nowIso
    units.push(Object.freeze({ candidateId, artifactHash, station: String(station.id), sourceStatus, enteredAt, ledgerStation }))
  }

  const readings: StationReading[] = []
  const line: Array<Readonly<{ station: string; status: string; waiting: number; inFlight: number; stationSlaSeconds: number }>> = []
  for (const station of WORKING_STATIONS) {
    const held = units.filter(unit => unit.station === String(station.id))
    const oldest = held.reduce<string | null>((min, unit) => (min === null || unit.enteredAt < min ? unit.enteredAt : min), null)
    let lastOutput = 0
    let inFlight = 0
    for (const unit of held) {
      const ledger = ledgerById.get(unit.candidateId)
      if (!ledger || text(ledger.station, 60) !== String(station.id)) continue
      const at = Date.parse(String(ledger.last_transition_at || ''))
      if (Number.isFinite(at) && at > lastOutput) lastOutput = at
      if (leaseIsLive(isoOrNull(ledger.lease_until), now)) inFlight += 1
    }
    readings.push(Object.freeze({
      station: station.id,
      waiting: held.length,
      lastOutputAt: lastOutput > 0 ? new Date(lastOutput).toISOString() : null,
      oldestWaitingSince: oldest,
    }))
    line.push(Object.freeze({
      station: String(station.id),
      status: station.sourceStatus,
      waiting: held.length,
      inFlight,
      stationSlaSeconds: station.stationSlaSeconds,
    }))
  }

  return Object.freeze({
    units: Object.freeze(units),
    line: Object.freeze(line),
    lineStops: decideLineStops({ stations: readings, now }),
    ledgerDisagreements,
    ledgerMissing,
  })
}

/**
 * The line as a human reads it in the Step 1 report (owner go, 2026-10-07). The report had only a line total and the
 * single most overdue station, so an exam station that went quiet for hours could not be told apart from an empty or
 * paused one. Per station: units waiting, units leased (in flight), how long the oldest has waited, and any station
 * idle past its SLA. Counts and times only: no candidate ids or artifact hashes.
 */
export function describeLineObservation(input: {
  at: string
  paused: boolean
  windowComplete?: boolean
  observation?: Pick<LineObservation, 'units' | 'line' | 'lineStops' | 'ledgerDisagreements' | 'ledgerMissing'> | null
}): string {
  if (input.paused) return `LINE NOW at ${input.at}: PAUSED by the line pause setting (no station is woken while paused)`
  const o = input.observation
  if (!o) return `LINE NOW at ${input.at}: not observed`
  const nowMs = Date.parse(input.at)
  const minutes = (iso: string | null) => {
    const ms = iso ? Date.parse(iso) : Number.NaN
    return Number.isFinite(ms) && Number.isFinite(nowMs) ? Math.max(0, Math.round((nowMs - ms) / 60000)) : null
  }
  const lines = [`LINE NOW at ${input.at}: units=${o.units.length}${input.windowComplete === false ? ' (window truncated)' : ''} ledgerDisagreements=${o.ledgerDisagreements} ledgerMissing=${o.ledgerMissing}`]
  for (const station of o.line) {
    const held = o.units.filter(unit => unit.station === station.station)
    const oldest = held.reduce<string | null>((min, unit) => (min === null || unit.enteredAt < min ? unit.enteredAt : min), null)
    const age = minutes(oldest)
    lines.push(`  ${station.station} (${station.status}) :: waiting=${station.waiting} inFlight=${station.inFlight} oldestWaitingMin=${age ?? 'n/a'} slaMin=${Math.round(station.stationSlaSeconds / 60)}`)
  }
  lines.push(o.lineStops.length
    ? `  stopped (idle past SLA): ${o.lineStops.map(stop => `${stop.station} waiting=${stop.waiting} idleMin=${Math.round(stop.idleSeconds / 60)}`).join(', ')}`
    : '  stopped (idle past SLA): none')
  return lines.join('\n')
}
// end of saas/lib/ai/cos/cosUniversityLineObservation.ts (if this line is missing, the paste was cut short)
