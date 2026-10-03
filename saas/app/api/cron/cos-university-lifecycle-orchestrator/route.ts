// saas/app/api/cron/cos-university-lifecycle-orchestrator/route.ts
//
// The assembly-line controller. Owner, 2026-10-02: "the individual stations should not own the schedule. The line
// owns the flow."
//
// It runs every minute and does four things, in this order:
//
//   1. Reconcile.      Every nonterminal artifact gets exactly one station, one next action, a queue position and an
//                      expected start time. Written in batches, not one awaited round trip per artifact.
//   2. Detect stops.   Material waiting at a station that has produced no output for longer than that STATION's SLA
//                      is a line stop. Minutes, not days, and independent of any one unit's deadline.
//   3. Dispatch.       EVERY station with waiting material and a free lane is woken this tick, in parallel, up to
//                      its own declared concurrency. Not one globally-oldest unit.
//   4. Report.         The queue, the leases, the line stops, the constraint and the takt time.
//
// What it does NOT do, and must never start doing: grade, pass, fail, promote, activate, dismiss or authorize spend.
// Every station keeps its own quality, admission, spend and promotion authority. This controller only ensures a
// station is awake while it has work, and records what is late.
//
// Previous defect this replaces: one global `.order('stage_deadline_at').limit(25).find(...)` pick, with WORKFORCE
// nonterminal and measured from arrival. Every active graduate was permanently overdue, so a handful of working
// graduates occupied the head of the overdue list and the canary queue behind them was never reached.
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  LINE_STATUSES,
  UNIVERSITY_LINE_CAPACITY,
  WORKING_STATIONS,
  decideLineStops,
  decideStationDispatch,
  leaseExpiresAt,
  leaseIsLive,
  lineConstraint,
  stationById,
  stationThroughputPerHour,
  type StationDemand,
  type StationReading,
} from '@/lib/ai/cos/cosUniversityAssemblyLine'
import {
  lifecycleDeadlineAnchor,
  lifecycleDeadlineInQueue,
  lifecycleExpectedStart,
  lifecyclePlan,
  shouldOrchestrate,
  stageChanged,
  type LifecycleArtifact,
} from '@/lib/ai/cos/cosUniversityLifecycleOrchestrator'
import { describeLineCapacity } from '@/lib/ai/cos/cosUniversityLineCapacity'
import { triggerStation } from '@/lib/ai/cos/cosUniversityAssemblyLineHandoff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_ARTIFACTS = 500
const RECONCILE_CHUNK = 200
const ACTION_TIMEOUT_MS = 8_000
const OVERDUE_REPORT_LIMIT = 50
// Per-unit placement, so an outside prover can take two samples and compute movement for itself instead of trusting
// this controller's own `dispatches` report. A heartbeat is not output: the only honest evidence the line works is
// the same unit observed at two different stations. Each row carries BOTH the station and the raw artifact status it
// was derived from, so a prover can also catch the controller disagreeing with the artifact table.
const UNITS_REPORT_LIMIT = 500

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`)
}

function clean(value: unknown, max = 400): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function requestHost(req: NextRequest): string {
  return String(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || req.nextUrl.host)
}

type LedgerRow = Record<string, unknown>

async function run(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503 })

  const now = new Date()
  const nowIso = now.toISOString()

  // ---------------------------------------------------------------------------------------------------------------
  // 1. Reconcile: one station, one next action, one queue position per unit.
  // ---------------------------------------------------------------------------------------------------------------
  const source = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_hash,status,updated_at')
    .in('status', [...LINE_STATUSES])
    .order('updated_at', { ascending: true })
    .limit(MAX_ARTIFACTS)
  if (source.error) throw source.error

  const ids = (source.data || []).map((row: any) => String(row.candidate_id || '')).filter(Boolean)
  const existing = ids.length
    ? await db.from('cos_university_lifecycle_orchestration')
      .select('candidate_id,artifact_hash,stage,station,stage_entered_at,stage_deadline_at,last_transition_at,last_action_at,orchestration_attempts,terminal,lease_until,lease_holder')
      .in('candidate_id', ids)
    : { data: [], error: null }
  if (existing.error) throw existing.error
  const byId = new Map((existing.data || []).map((row: any) => [String(row.candidate_id), row]))

  // Queue order per station: oldest arrival first, so position 0 is the unit the station is actually working on next.
  const arrivals = new Map<string, Array<{ candidateId: string; enteredAt: Date }>>()
  const prepared: Array<{ artifact: LifecycleArtifact; previous: any; enteredAt: Date; changed: boolean }> = []

  for (const raw of source.data || []) {
    const artifact: LifecycleArtifact = {
      candidateId: String(raw.candidate_id || ''),
      artifactHash: String(raw.trained_artifact_hash || ''),
      subjectId: String(raw.subject_id || ''),
      status: String(raw.status || ''),
      updatedAt: String(raw.updated_at || nowIso),
    }
    if (!artifact.candidateId || !artifact.artifactHash) continue
    const plan = lifecyclePlan(artifact.status)
    if (!plan) continue
    const previous: any = byId.get(artifact.candidateId) || null
    const changed = stageChanged(previous, plan, artifact.artifactHash)
    const enteredAt = changed ? now : new Date(String(previous?.stage_entered_at || nowIso))
    prepared.push({ artifact, previous, enteredAt: Number.isFinite(enteredAt.getTime()) ? enteredAt : now, changed })
    if (!plan.terminal) {
      const bucket = arrivals.get(plan.stage) || []
      bucket.push({ candidateId: artifact.candidateId, enteredAt })
      arrivals.set(plan.stage, bucket)
    }
  }

  const queuePosition = new Map<string, number>()
  for (const [stage, bucket] of arrivals) {
    bucket.sort((left, right) => left.enteredAt.getTime() - right.enteredAt.getTime())
    bucket.forEach((entry, index) => queuePosition.set(`${stage}:${entry.candidateId}`, index))
  }

  const rows: LedgerRow[] = []
  let transitions = 0
  for (const entry of prepared) {
    const plan = lifecyclePlan(entry.artifact.status)
    if (!plan) continue
    const position = plan.terminal ? null : (queuePosition.get(`${plan.stage}:${entry.artifact.candidateId}`) ?? 0)
    const anchor = lifecycleDeadlineAnchor({
      plan,
      enteredAt: entry.enteredAt,
      lastActionAt: entry.changed ? null : (entry.previous?.last_action_at ?? null),
    })
    const deadlineAt = plan.terminal
      ? now
      : (lifecycleDeadlineInQueue({ enteredAt: anchor, status: entry.artifact.status, queueAhead: position ?? 0 }) || now)
    const expectedStartAt = plan.terminal
      ? null
      : lifecycleExpectedStart({ enteredAt: entry.enteredAt, status: entry.artifact.status, queueAhead: position ?? 0 })
    // A lease belongs to the unit's CURRENT station. A unit that moved carries none of its old station's claim.
    const leaseStillLive = !entry.changed && leaseIsLive(entry.previous?.lease_until ?? null, now)

    rows.push({
      candidate_id: entry.artifact.candidateId,
      artifact_hash: entry.artifact.artifactHash,
      subject_id: entry.artifact.subjectId || null,
      stage: plan.stage,
      station: plan.stage,
      source_status: entry.artifact.status,
      stage_entered_at: entry.enteredAt.toISOString(),
      stage_deadline_at: deadlineAt.toISOString(),
      last_observed_at: nowIso,
      last_transition_at: entry.changed ? nowIso : String(entry.previous?.last_transition_at || entry.enteredAt.toISOString()),
      orchestration_attempts: entry.changed ? 0 : Number(entry.previous?.orchestration_attempts || 0),
      last_action_at: entry.changed ? null : (entry.previous?.last_action_at ?? null),
      next_action: plan.nextAction,
      terminal: plan.terminal,
      queue_position: position,
      expected_start_at: expectedStartAt ? expectedStartAt.toISOString() : null,
      lease_until: leaseStillLive ? String(entry.previous.lease_until) : null,
      lease_holder: leaseStillLive ? clean(entry.previous.lease_holder, 120) || null : null,
      updated_at: nowIso,
    })
    if (entry.changed) transitions += 1
  }

  // Batched, so the reconcile cost is the number of CHUNKS rather than the number of artifacts. One awaited round
  // trip per artifact is what put 2500 sequential writes inside a 60-second budget running every minute.
  let reconciled = 0
  for (let offset = 0; offset < rows.length; offset += RECONCILE_CHUNK) {
    const chunk = rows.slice(offset, offset + RECONCILE_CHUNK)
    const write = await db.from('cos_university_lifecycle_orchestration').upsert(chunk, { onConflict: 'candidate_id' })
    if (write.error) throw write.error
    reconciled += chunk.length
  }

  // ---------------------------------------------------------------------------------------------------------------
  // 2. Line-stop detection: material present and no output, measured against each station's own SLA.
  // ---------------------------------------------------------------------------------------------------------------
  const readings: StationReading[] = []
  const demand: StationDemand[] = []
  for (const station of WORKING_STATIONS) {
    const bucket = arrivals.get(station.id) || []
    const held = rows.filter(row => row.station === station.id)
    const lastOutput = held.reduce<number>((newest, row) => {
      const at = Date.parse(String(row.last_transition_at || ''))
      return Number.isFinite(at) && at > newest ? at : newest
    }, 0)
    readings.push(Object.freeze({
      station: station.id,
      waiting: bucket.length,
      lastOutputAt: lastOutput > 0 ? new Date(lastOutput).toISOString() : null,
      oldestWaitingSince: bucket.length ? bucket[0].enteredAt.toISOString() : null,
    }))
    const inFlight = held.filter(row => leaseIsLive(row.lease_until as string | null, now)).length
    demand.push(Object.freeze({ station: station.id, waiting: bucket.length, inFlight }))
  }
  const lineStops = decideLineStops({ stations: readings, now })

  // ---------------------------------------------------------------------------------------------------------------
  // 3. Dispatch every station that has work and a free lane. Rule 3: parallel capacity, not one unit per tick.
  // ---------------------------------------------------------------------------------------------------------------
  const dispatchable = decideStationDispatch({ demand })
  const dispatches = await Promise.all(dispatchable.map(async plan => {
    const station = stationById(plan.station)
    if (!station) return { station: plan.station, dispatched: false, reason: 'station_unknown' }

    // Claim the oldest unleased units at this station, up to the free capacity, and lease them. The lease is what
    // stops the next tick re-poking a lane that is already busy; the station's own authority still decides the unit.
    const claimable = rows
      .filter(row => row.station === plan.station && row.terminal !== true && !leaseIsLive(row.lease_until as string | null, now))
      .sort((left, right) => Date.parse(String(left.stage_entered_at)) - Date.parse(String(right.stage_entered_at)))
      .slice(0, plan.freeCapacity)

    const pastWatchdog = claimable.filter(row => shouldOrchestrate({
      now,
      deadlineAt: String(row.stage_deadline_at),
      terminal: row.terminal === true,
      lastActionAt: row.last_action_at ? String(row.last_action_at) : null,
    }))

    // A station with work and a free lane is woken whether or not a unit is past its watchdog yet: that is the line
    // owning the flow. The watchdog only decides what gets REPORTED as late.
    if (!claimable.length) return { station: plan.station, dispatched: false, reason: 'every_lane_leased' }

    const until = leaseExpiresAt(station, now).toISOString()
    const leased = await db.from('cos_university_lifecycle_orchestration')
      .update({
        lease_until: until,
        lease_holder: 'assembly_line_controller',
        last_action_at: nowIso,
        updated_at: nowIso,
      })
      .in('candidate_id', claimable.map(row => String(row.candidate_id)))
      .eq('station', plan.station)
      .eq('terminal', false)
      .select('candidate_id')
    if (leased.error) throw leased.error

    const lanes = Math.max(1, Math.min(plan.freeCapacity, (leased.data || []).length || 1))
    const fired = await Promise.all(Array.from({ length: lanes }, () => triggerStation({
      path: plan.workerPath,
      host: requestHost(req),
      timeoutMs: 2_000,
    })))
    const woken = fired.filter(result => result.ok).length
    if (!woken) {
      await db.from('cos_university_lifecycle_orchestration')
        .update({ last_error: clean(fired[0]?.detail || 'station_not_woken'), updated_at: new Date().toISOString() })
        .in('candidate_id', claimable.map(row => String(row.candidate_id)))
    }
    return {
      station: plan.station,
      dispatched: woken > 0,
      workerPath: plan.workerPath,
      lanesWoken: woken,
      lanesRequested: lanes,
      leased: (leased.data || []).length,
      waiting: plan.waiting,
      overdueUnits: pastWatchdog.length,
      detail: clean(fired[0]?.detail, 200),
      authorityExpanded: false,
    }
  }))

  // ---------------------------------------------------------------------------------------------------------------
  // 4. Report.
  // ---------------------------------------------------------------------------------------------------------------
  const overdue = await db.from('cos_university_lifecycle_orchestration')
    .select('candidate_id,station,stage,queue_position,expected_start_at,stage_deadline_at,lease_until,orchestration_attempts,next_action,last_error')
    .eq('terminal', false)
    .lte('stage_deadline_at', new Date().toISOString())
    .order('stage_deadline_at', { ascending: true })
    .limit(OVERDUE_REPORT_LIMIT)
  if (overdue.error) throw overdue.error

  const constraint = lineConstraint()

  return NextResponse.json({
    ok: true,
    schemaVersion: 'cos-university-assembly-line-controller-v2',
    at: new Date().toISOString(),
    capacity: UNIVERSITY_LINE_CAPACITY,
    capacityDescription: describeLineCapacity(UNIVERSITY_LINE_CAPACITY),
    reconciled,
    transitions,
    line: WORKING_STATIONS.map(station => {
      const reading = readings.find(entry => entry.station === station.id)
      const load = demand.find(entry => entry.station === station.id)
      return {
        station: station.id,
        status: station.sourceStatus,
        waiting: reading?.waiting ?? 0,
        inFlight: load?.inFlight ?? 0,
        concurrency: station.concurrency,
        batched: station.batched,
        cadenceSeconds: station.cadenceSeconds,
        stationSlaSeconds: station.stationSlaSeconds,
        throughputPerHour: Math.round(stationThroughputPerHour(station) * 10) / 10,
      }
    }),
    constraint,
    lineStops,
    dispatches,
    units: rows
      .filter(row => row.terminal !== true)
      .slice(0, UNITS_REPORT_LIMIT)
      .map(row => ({
        candidateId: row.candidate_id,
        artifactHash: row.artifact_hash,
        station: row.station,
        sourceStatus: row.source_status,
        enteredAt: row.stage_entered_at,
        queuePosition: row.queue_position,
        expectedStartAt: row.expected_start_at,
        leaseUntil: row.lease_until,
      })),
    unitsReported: Math.min(rows.length, UNITS_REPORT_LIMIT),
    overdue: overdue.data || [],
    invariant: 'every_nonterminal_artifact_has_a_named_next_action_and_deadline',
    lineInvariant: 'the_line_owns_the_flow_stations_own_only_their_own_authority',
    automaticPromotionAuthorized: false,
    authorityExpanded: false,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

export async function GET(req: NextRequest) {
  try { return await run(req) }
  catch (error) {
    const message = error instanceof Error ? clean(error.message) : clean(error)
    console.error('[cos-university-lifecycle-orchestrator]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
export async function POST(req: NextRequest) { return GET(req) }
// end of saas/app/api/cron/cos-university-lifecycle-orchestrator/route.ts (if this line is missing, the paste was cut short)