//
// Owner, 2026-10-02: "it should function like an assembly line style ... the individual stations should not own the
// schedule. The line owns the flow."
//
// This module is the line definition: the single place that says what the stations are, how fast each one can really
// go, which station a finished unit hands off to, and how long a station may hold material without producing output
// before the line is declared stopped. It is pure, imports nothing, grades nothing and authorizes nothing. Every
// number below was read out of the code or the cron schedule that actually governs that station, and the comment on
// each one says where.
//
// Owner, 2026-10-03: "build a Ferrari not a Lada." Every concurrency below used to be a constant chosen to ration a
// 10-worker RunPod account. They now come from `cosUniversityLineCapacity.ts`, which derives each station's width
// from the ONE number a deployment declares: how many concurrent inference workers it has. A buyer with resources
// gets a line sized to their infrastructure; a small test rig declares its real size and gets small numbers.
//
// It exists because the four rules the owner set cannot be enforced from inside the stations:
//
//   1. No unit without a destination.  Every nonterminal status maps to exactly one station and one next action.
//   2. Immediate handoff.              Completion names the next station, so the conveyor can fire it at once. The
//                                      one-minute controller is the safety net, not the transport.
//   3. Parallel capacity.              A station's concurrency is declared, so the controller can run it at capacity
//                                      instead of moving one unit per tick.
//   4. Line-stop detection.            Material waiting plus no output for longer than the STATION's own SLA is a
//                                      line stop, detected in minutes, independently of any one unit's deadline.
//
// The distinction that makes this safe: a station SLA is a WATCHDOG, never a mover. Nothing here promotes, passes,
// fails or dismisses a unit. The stations keep every quality, spend, admission and promotion authority they have.

import { lineCapacity } from './cosUniversityLineCapacity.ts'

const CAPACITY = lineCapacity()

/** One station on the line. `TERMINAL` is the exit, not a station that works. */
export type StationId =
  | 'EXACT_CANARY'
  | 'INDEPENDENT_EVALUATION'
  | 'QUARANTINE_REMEDIATION'
  | 'GRADUATION'
  | 'WORKFORCE'
  | 'TERMINAL'

export type Station = Readonly<{
  id: StationId
  /** The artifact status that places a unit at this station. One status, one station: rule 1. */
  sourceStatus: string
  nextAction: string
  /** The cron route that does this station's work, or null at the exit. */
  workerPath: string | null
  /** How often this station's own cron fires, from vercel.json. */
  cadenceSeconds: number
  /** How many units it can hold at once, from the station's own in-flight cap. */
  concurrency: number
  /** True when one tick drains its whole queue, so throughput is bounded by cadence rather than by work time. */
  batched: boolean
  /** How long one unit occupies the station, from the station's own in-flight TTL or active window. */
  workSeconds: number
  /**
   * Line-stop SLA: material waiting and NO output for this long means the station is not working.
   * Set to roughly one unit of work plus two of its own ticks, so a slow tick is never an incident and a stopped
   * station is caught in minutes.
   */
  stationSlaSeconds: number
  terminal: boolean
  /**
   * A station whose units are DOING work rather than WAITING for it. Its unit deadline re-arms from the last action
   * instead of from arrival, so an occupied station can never fill the overdue queue with permanently-late units and
   * starve the head of the line.
   */
  recurring: boolean
}>

/**
 * The line, in order. Every figure is sourced.
 *
 *   EXACT_CANARY            cron `*​/2` = 120s (vercel.json). `readInFlightCanary` returns the single in-flight
 *                           canary and the route exits early when one exists, so concurrency is 1, and
 *                           MASS_CANARY_IN_FLIGHT_TTL_MS = 10min is how long a unit holds the station.
 *                           Ceiling: MASS_CANARY_ROLLING_MAX_APPROVALS = 12 per rolling hour.
 *   INDEPENDENT_EVALUATION  cron every odd minute = 120s. MASS_EVALUATION_MAX_IN_FLIGHT = 2 (4 when capacity-aware),
 *                           MASS_EVALUATION_ACTIVE_MS = 12min per unit.
QUARANTINE_REMEDIATION  the rework station, not a warehouse: a unit enters, is repaired and rejoins the line, or
 *                           receives a documented terminal disposition and leaves it. Cron :13/:28/:43/:58 = 900s.
 *                           QUARANTINE_RESOLUTION_MAX_PER_RUN = 100, batched: one tick disposes of the whole queue,
 *                           so this station is never the constraint.
 *   GRADUATION              cron :07..:57 = 600s. Registration is a registry write with no spend and no RunPod
 *                           reservation, so it is batched up to MASS_GRADUATE_REGISTRATION_SCAN_LIMIT. Activation
 *                           inside the same route stays serial on purpose: each activation pins one of the ten
 *                           account-wide RunPod workers.
 *   WORKFORCE               cron :07..:57 = 600s. An active graduate is working, not queueing, so this station
 *                           recurs rather than expiring.
 */
export const UNIVERSITY_ASSEMBLY_LINE: readonly Station[] = Object.freeze([
  Object.freeze({
    id: 'EXACT_CANARY' as StationId,
    sourceStatus: 'evaluation_ready',
    nextAction: 'run_exact_canary_and_admit_evaluation',
    workerPath: '/api/cron/runpod-mass-distilled-local-deploy',
    cadenceSeconds: 120,
    concurrency: CAPACITY.canary,
    batched: false,
    workSeconds: 10 * 60,
    stationSlaSeconds: 20 * 60,
    terminal: false,
    recurring: false,
  }),
  Object.freeze({
    id: 'INDEPENDENT_EVALUATION' as StationId,
    sourceStatus: 'evaluation_pending',
    nextAction: 'complete_independent_evaluation',
    workerPath: '/api/cron/cos-university-mass-distilled-evaluation',
    cadenceSeconds: 120,
    concurrency: CAPACITY.evaluation,
    batched: false,
    workSeconds: 12 * 60,
    stationSlaSeconds: 25 * 60,
    terminal: false,
    recurring: false,
  }),
  Object.freeze({
    id: 'QUARANTINE_REMEDIATION' as StationId,
    sourceStatus: 'quarantined',
    nextAction: 'repair_and_rejoin_or_dispose',
    workerPath: '/api/cron/cos-university-mass-backlog-compact',
    cadenceSeconds: 900,
    concurrency: 100,
    batched: true,
    workSeconds: 60,
    stationSlaSeconds: 35 * 60,
    terminal: false,
    recurring: false,
  }),
  Object.freeze({
    id: 'GRADUATION' as StationId,
    sourceStatus: 'runtime_pending',
    nextAction: 'register_and_activate_graduate',
    workerPath: '/api/cron/cos-university-graduate-activation',
    cadenceSeconds: 600,
    concurrency: CAPACITY.registrationsPerTick,
    batched: true,
    workSeconds: 60,
    stationSlaSeconds: 25 * 60,
    terminal: false,
    recurring: false,
  }),
  Object.freeze({
    id: 'WORKFORCE' as StationId,
    sourceStatus: 'active',
    nextAction: 'assign_and_verify_production_work',
    workerPath: '/api/cron/cos-workforce-pipeline',
    cadenceSeconds: 600,
    concurrency: 100,
    batched: true,
    workSeconds: 60,
    stationSlaSeconds: 35 * 60,
    terminal: false,
    recurring: true,
  }),
  Object.freeze({
    id: 'TERMINAL' as StationId,
    sourceStatus: 'retired',
    nextAction: 'none',
    workerPath: null,
    cadenceSeconds: 0,
    concurrency: 0,
    batched: false,
    workSeconds: 0,
    stationSlaSeconds: 0,
    terminal: true,
    recurring: false,
  }),
])

const BY_STATUS: ReadonlyMap<string, Station> = new Map(
  UNIVERSITY_ASSEMBLY_LINE.map(station => [station.sourceStatus, station]),
)
const BY_ID: ReadonlyMap<string, Station> = new Map(
  UNIVERSITY_ASSEMBLY_LINE.map(station => [String(station.id), station]),
)

/** Rule 1: the station that owns a unit in this status, or null when the status is not on the line. */
export function stationForStatus(status: string): Station | null {
  return BY_STATUS.get(String(status || '').trim()) ?? null
}

export function stationById(id: string): Station | null {
  return BY_ID.get(String(id || '').trim()) ?? null
}

/** Every station that actually works, in line order. */
export const WORKING_STATIONS: readonly Station[] = Object.freeze(
  UNIVERSITY_ASSEMBLY_LINE.filter(station => !station.terminal && station.workerPath),
)

export const LINE_STATUSES: readonly string[] = Object.freeze(
  UNIVERSITY_ASSEMBLY_LINE.map(station => station.sourceStatus),
)

/**
 * Units per hour this station can really finish.
 *
 * A batched station is bounded by how often it runs, because one tick disposes of its whole queue. A serial station
 * is bounded by how many units it can hold at once divided by how long each one occupies it.
 */
export function stationThroughputPerHour(station: Station): number {
  if (station.terminal || !station.workerPath) return 0
  if (station.batched) {
    if (station.cadenceSeconds <= 0) return 0
    return (3600 / station.cadenceSeconds) * Math.max(1, station.concurrency)
  }
  if (station.workSeconds <= 0) return 0
  return (3600 / station.workSeconds) * Math.max(1, station.concurrency)
}

/**
 * How long the slowest station holds one unit.
 *
 * This is the line's CYCLE time, as distinct from its takt. Widening the line raises throughput and shrinks the takt
 * - at enterprise capacity the takt is seconds - but one unit still takes as long as the station's work. Anything
 * that waits to observe a departure must wait at least this long, or it is sampling faster than the line can
 * possibly produce and will read work-in-progress as a stoppage.
 */
export function lineCycleSeconds(stations: readonly Station[] = WORKING_STATIONS): number {
  let longest = 0
  for (const station of stations) {
    if (station.terminal || !station.workerPath) continue
    if (station.workSeconds > longest) longest = station.workSeconds
  }
  return longest
}

export type LineConstraint = Readonly<{
  station: StationId
  throughputPerHour: number
  /** Seconds between finished units at the pace of the slowest station. */
  taktSeconds: number
}>

/** The slowest working station sets the pace of the whole line. That is the only number worth tuning. */
export function lineConstraint(stations: readonly Station[] = WORKING_STATIONS): LineConstraint | null {
  let slowest: Station | null = null
  let slowestRate = Number.POSITIVE_INFINITY
  for (const station of stations) {
    if (station.terminal || !station.workerPath) continue
    const rate = stationThroughputPerHour(station)
    if (!Number.isFinite(rate) || rate <= 0) continue
    if (rate < slowestRate) {
      slowestRate = rate
      slowest = station
    }
  }
  if (!slowest || !Number.isFinite(slowestRate) || slowestRate <= 0) return null
  return Object.freeze({
    station: slowest.id,
    throughputPerHour: slowestRate,
    taktSeconds: Math.round(3600 / slowestRate),
  })
}

/**
 * How long a unit this far back in a station's queue should expect to wait before its own work starts.
 *
 * This is what turns a timer into a watchdog. A unit twenty deep in a serial station is not late because the station
 * is broken; it is late because nineteen units are ahead of it. Charging it the same flat deadline as the unit at the
 * head fills the overdue list with units nothing is wrong with, and then the real stall is invisible inside it.
 */
export function expectedStartSeconds(station: Station, queueAhead: number): number {
  const ahead = Math.max(0, Math.floor(Number(queueAhead) || 0))
  if (ahead === 0) return 0
  if (station.batched) {
    const perTick = Math.max(1, station.concurrency)
    return Math.floor(ahead / perTick) * Math.max(station.cadenceSeconds, 1)
  }
  const lanes = Math.max(1, station.concurrency)
  return Math.ceil(ahead / lanes) * Math.max(station.workSeconds, 1)
}

/**
 * The watchdog deadline for one unit: its own expected start plus the station's SLA.
 *
 * Reaching it does not move the unit and does not judge it. It means the controller should poke this station and
 * record that this unit has waited longer than the line's own arithmetic says it should have.
 */
export function unitDeadlineSeconds(station: Station, queueAhead: number): number {
  if (station.terminal) return 0
  return station.stationSlaSeconds + expectedStartSeconds(station, queueAhead)
}

export function unitDeadlineAt(input: { station: Station; queueAhead: number; enteredAt: Date }): Date {
  const base = input.enteredAt.getTime()
  const seconds = unitDeadlineSeconds(input.station, input.queueAhead)
  return new Date(base + seconds * 1000)
}

// ---------------------------------------------------------------------------------------------------------------
// Rule 4: line-stop detection
// ---------------------------------------------------------------------------------------------------------------

export type StationReading = Readonly<{
  station: StationId
  /** Units currently held by this station. Zero means nothing to do, which is never a line stop. */
  waiting: number
  /** Newest movement OUT of this station, ISO-8601. Null when it has never moved anything. */
  lastOutputAt: string | null
  /** Oldest unit still held, ISO-8601. The fallback clock for a station that has never produced output. */
  oldestWaitingSince: string | null
}>

export type LineStop = Readonly<{
  station: StationId
  waiting: number
  /** How long the station has held material without producing output, in seconds. */
  idleSeconds: number
  slaSeconds: number
  /** What the line loses per hour while this station is stopped. */
  throughputPerHour: number
}>

const parsedMs = (value: string | null | undefined): number | null => {
  if (!value) return null
  const at = Date.parse(String(value))
  return Number.isFinite(at) ? at : null
}

/**
 * Pure: which stations are holding material and producing nothing.
 *
 * An empty station is silent, never stopped: a drained queue is the line working, and an alarm that fires on it
 * trains everyone to ignore the alarm. A station that has never produced output at all is measured from its oldest
 * unit's arrival instead, so a station that was born broken is caught rather than excused for lack of evidence. An
 * unreadable or future clock reports nothing: a broken timestamp is a reason to look, never evidence the line stopped.
 */
export function decideLineStops(input: {
  stations: readonly StationReading[]
  now: Date
}): readonly LineStop[] {
  const nowMs = input.now instanceof Date ? input.now.getTime() : Number.NaN
  if (!Number.isFinite(nowMs)) return Object.freeze([])

  const stops: LineStop[] = []
  for (const reading of input.stations) {
    const station = stationById(String(reading.station))
    if (!station || station.terminal || station.stationSlaSeconds <= 0) continue
    const waiting = Math.floor(Number(reading.waiting))
    if (!Number.isFinite(waiting) || waiting <= 0) continue

    const movedAt = parsedMs(reading.lastOutputAt) ?? parsedMs(reading.oldestWaitingSince)
    if (movedAt === null) continue
    const idleSeconds = Math.floor((nowMs - movedAt) / 1000)
    if (idleSeconds <= station.stationSlaSeconds) continue

    stops.push(Object.freeze({
      station: station.id,
      waiting,
      idleSeconds,
      slaSeconds: station.stationSlaSeconds,
      throughputPerHour: stationThroughputPerHour(station),
    }))
  }
  return Object.freeze(stops)
}

// ---------------------------------------------------------------------------------------------------------------
// Rule 3: running a station at capacity instead of one unit per tick
// ---------------------------------------------------------------------------------------------------------------

export type StationDemand = Readonly<{
  station: StationId
  waiting: number
  /** Units this station is already working on, counted from live leases. */
  inFlight: number
}>

export type StationDispatch = Readonly<{
  station: StationId
  workerPath: string
  /** How many more units this station may take right now. Zero means it is at capacity; it is not dispatched. */
  freeCapacity: number
  waiting: number
}>

/**
 * Pure: which stations should be poked this tick, and how much room each has.
 *
 * Per station, not one globally-oldest unit. A single global pick is what let an occupied WORKFORCE sit at the head
 * of the overdue list and keep the controller from ever looking at the canary queue behind it.
 */
export function decideStationDispatch(input: {
  demand: readonly StationDemand[]
  stations?: readonly Station[]
}): readonly StationDispatch[] {
  const dispatches: StationDispatch[] = []
  for (const entry of input.demand) {
    const station = stationById(String(entry.station))
    if (!station || station.terminal || !station.workerPath) continue
    const waiting = Math.max(0, Math.floor(Number(entry.waiting) || 0))
    if (waiting <= 0) continue
    const inFlight = Math.max(0, Math.floor(Number(entry.inFlight) || 0))
    const capacity = station.batched ? 1 : Math.max(1, station.concurrency)
    const freeCapacity = Math.max(0, capacity - inFlight)
    if (freeCapacity <= 0) continue
    dispatches.push(Object.freeze({
      station: station.id,
      workerPath: station.workerPath,
      freeCapacity: Math.min(freeCapacity, waiting),
      waiting,
    }))
  }
  return Object.freeze(dispatches)
}

/** How long a dispatch may hold a lane before the controller may retry it. Two of the station's own ticks. */
export function leaseSeconds(station: Station): number {
  return Math.max(station.workSeconds, station.cadenceSeconds * 2, 120)
}

export function leaseExpiresAt(station: Station, now: Date): Date {
  return new Date(now.getTime() + leaseSeconds(station) * 1000)
}

/** A lease that has expired is not a live claim, so the lane is free again. Fail-open on an unreadable lease. */
export function leaseIsLive(leaseUntil: string | null | undefined, now: Date): boolean {
  const until = parsedMs(leaseUntil)
  if (until === null) return false
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs)) return false
  return until > nowMs
}
