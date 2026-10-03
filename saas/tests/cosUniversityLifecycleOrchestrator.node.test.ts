// saas/tests/cosUniversityLifecycleOrchestrator.node.test.ts
//
// Owner, 2026-10-02: "it should function like an assembly line style ... the individual stations should not own the
// schedule. The line owns the flow." Four rules were set, and each one has tests below that fail the build if the
// line stops obeying it:
//
//   1. No unit without a destination.
//   2. Immediate handoff; the one-minute controller is the safety net, not the transport.
//   3. Parallel capacity; registration/bookkeeping batched, not one unit per ten minutes.
//   4. Line-stop detection in MINUTES, independent of any one unit's deadline.
//
// Plus the defect that made the first controller starve its own queue: WORKFORCE was nonterminal and measured from
// arrival, so every working graduate was permanently overdue and sat at the head of the overdue list forever.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  UNIVERSITY_LIFECYCLE_PLAN,
  lifecycleDeadline,
  lifecycleDeadlineAnchor,
  lifecycleDeadlineInQueue,
  lifecycleExpectedStart,
  lifecyclePlan,
  shouldOrchestrate,
  stageChanged,
} from '../lib/ai/cos/cosUniversityLifecycleOrchestrator.ts'
import {
  LINE_STATUSES,
  UNIVERSITY_ASSEMBLY_LINE,
  WORKING_STATIONS,
  decideLineStops,
  decideStationDispatch,
  expectedStartSeconds,
  leaseIsLive,
  leaseSeconds,
  lineConstraint,
  stationById,
  stationForStatus,
  stationThroughputPerHour,
  unitDeadlineSeconds,
} from '../lib/ai/cos/cosUniversityAssemblyLine.ts'
import { handoffPlan } from '../lib/ai/cos/cosUniversityAssemblyLineHandoff.ts'

const NOW = new Date('2026-10-02T20:00:00.000Z')
const NONTERMINAL = ['evaluation_ready', 'evaluation_pending', 'quarantined', 'runtime_pending', 'active']

// ---------------------------------------------------------------------------------------------------------------
// Rule 1: no unit without a destination
// ---------------------------------------------------------------------------------------------------------------

test('every nonterminal artifact status has one owner, deadline and worker', () => {
  for (const status of NONTERMINAL) {
    const plan = lifecyclePlan(status)
    assert.ok(plan, status)
    assert.equal(plan.terminal, false)
    assert.ok(plan.deadlineMs > 0)
    assert.match(String(plan.nextAction), /\S/)
    assert.match(String(plan.workerPath), /^\/api\/cron\//)
  }
  assert.equal(UNIVERSITY_LIFECYCLE_PLAN.retired.terminal, true)
  assert.equal(UNIVERSITY_LIFECYCLE_PLAN.retired.workerPath, null)
})

test('one status maps to exactly one station, and the line has no duplicate station', () => {
  const stations = UNIVERSITY_ASSEMBLY_LINE.map(station => station.id)
  assert.equal(new Set(stations).size, stations.length, 'a station id is declared twice')
  const statuses = UNIVERSITY_ASSEMBLY_LINE.map(station => station.sourceStatus)
  assert.equal(new Set(statuses).size, statuses.length, 'two stations claim the same status')
  for (const status of [...NONTERMINAL, 'retired']) {
    assert.ok(stationForStatus(status), `${status} has no station`)
    assert.ok(LINE_STATUSES.includes(status), `${status} is not in the controller's status list`)
  }
  // A status that is not on the line gets no destination invented for it.
  assert.equal(stationForStatus('training'), null)
  assert.equal(stationForStatus(''), null)
})

test('the controller reconciles exactly the statuses the line declares', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-lifecycle-orchestrator/route.ts', import.meta.url), 'utf8')
  // A hand-maintained second list is how a status silently stops being reconciled.
  assert.match(route, /\.in\('status', \[\.\.\.LINE_STATUSES\]\)/)
  assert.doesNotMatch(route, /const ORCHESTRATED_STATUSES/)
})

// ---------------------------------------------------------------------------------------------------------------
// Rule 2: immediate handoff
// ---------------------------------------------------------------------------------------------------------------

test('a finished unit names its receiving station and the worker to wake', () => {
  const plan = handoffPlan({ fromStatus: 'evaluation_ready', toStatus: 'evaluation_pending' })
  assert.ok(plan)
  assert.equal(plan.from, 'EXACT_CANARY')
  assert.equal(plan.to, 'INDEPENDENT_EVALUATION')
  assert.equal(plan.triggerPath, '/api/cron/cos-university-mass-distilled-evaluation')
  assert.equal(plan.terminal, false)
  assert.equal(plan.authorityExpanded, false)
})

test('a unit leaving the line is handed nowhere and wakes nothing', () => {
  const plan = handoffPlan({ fromStatus: 'quarantined', toStatus: 'retired' })
  assert.ok(plan)
  assert.equal(plan.terminal, true)
  assert.equal(plan.triggerPath, null)
})

test('a destination that is not on the line is refused rather than guessed', () => {
  assert.equal(handoffPlan({ toStatus: 'not_a_status' }), null)
  assert.equal(handoffPlan({ toStatus: '' }), null)
})

test('the conveyor carries and cannot grade', () => {
  const conveyor = readFileSync(new URL('../lib/ai/cos/cosUniversityAssemblyLineHandoff.ts', import.meta.url), 'utf8')
  assert.match(conveyor, /authorityExpanded: false/)
  assert.doesNotMatch(conveyor, /evaluationPassed\s*:\s*true/)
  assert.doesNotMatch(conveyor, /productionTrafficAuthorized\s*:\s*true/)
  // It may only write the bookkeeping ledger. Touching the artifact table would make it a promoter.
  assert.doesNotMatch(conveyor, /cos_local_distillation_artifacts/)
  assert.doesNotMatch(conveyor, /cos_university_graduate_model_registry/)
})

// ---------------------------------------------------------------------------------------------------------------
// Rule 3: parallel capacity
// ---------------------------------------------------------------------------------------------------------------

test('a station with free lanes is dispatched up to its own concurrency, not once', () => {
  const evaluation = stationById('INDEPENDENT_EVALUATION')!
  assert.equal(evaluation.concurrency, 2, 'MASS_EVALUATION_MAX_IN_FLIGHT')
  const [dispatch] = decideStationDispatch({
    demand: [{ station: 'INDEPENDENT_EVALUATION', waiting: 40, inFlight: 0 }],
  })
  assert.ok(dispatch)
  assert.equal(dispatch.freeCapacity, 2)
  assert.equal(dispatch.workerPath, '/api/cron/cos-university-mass-distilled-evaluation')
})

test('a station at capacity is left alone, and an empty station is never poked', () => {
  assert.deepEqual(decideStationDispatch({ demand: [{ station: 'INDEPENDENT_EVALUATION', waiting: 40, inFlight: 2 }] }), [])
  assert.deepEqual(decideStationDispatch({ demand: [{ station: 'EXACT_CANARY', waiting: 0, inFlight: 0 }] }), [])
  assert.deepEqual(decideStationDispatch({ demand: [{ station: 'TERMINAL', waiting: 9, inFlight: 0 }] }), [])
  assert.deepEqual(decideStationDispatch({ demand: [{ station: 'not_a_station' as never, waiting: 9, inFlight: 0 }] }), [])
})

test('every station with work is dispatched in the same tick, so one station cannot block another', () => {
  // The defect this replaces: one globally-oldest pick meant a permanently-overdue WORKFORCE unit occupied the only
  // dispatch slot and the canary queue behind it was never reached.
  const dispatches = decideStationDispatch({
    demand: WORKING_STATIONS.map(station => ({ station: station.id, waiting: 5, inFlight: 0 })),
  })
  assert.equal(dispatches.length, WORKING_STATIONS.length)
  assert.deepEqual(
    dispatches.map(entry => entry.station).sort(),
    WORKING_STATIONS.map(station => station.id).sort(),
  )
})

test('registration is batched, because a registry write spends nothing and reserves no worker', () => {
  const graduation = stationById('GRADUATION')!
  assert.equal(graduation.batched, true)
  assert.ok(graduation.concurrency > 1, 'a batched bookkeeping station must not be serialised to one')
  // Six per hour is what one-per-ten-minutes produced, and training runs ahead of that.
  assert.ok(stationThroughputPerHour(graduation) > 6, 'graduation must out-run the old one-per-tick rate')

  const route = readFileSync(new URL('../app/api/cron/cos-university-graduate-activation/route.ts', import.meta.url), 'utf8')
  const registerFn = route.slice(
    route.indexOf('async function registerNextMassGraduate()'),
    route.indexOf('async function proveNextGraduateRollback()'),
  )
  assert.ok(registerFn.length > 0)
  assert.match(registerFn, /registrations\.push\(\{/, 'registration must accumulate, not return on the first success')
  assert.match(registerFn, /registeredCount: registrations\.filter/)
  assert.doesNotMatch(registerFn, /\n\s*return \{\n\s*registered: registration\.tracked === true,/,
    'the single-registration early return is back')

  // Activation stays serial on purpose: one activation pins one of the ten account-wide RunPod workers.
  assert.match(route, /\.eq\('status', 'pending_runtime'\)[\s\S]{0,200}?\.limit\(1\)/)
})

test('the line names its own bottleneck and its takt time', () => {
  const constraint = lineConstraint()
  assert.ok(constraint, 'a line with no measurable constraint cannot be paced')
  assert.ok(constraint.throughputPerHour > 0)
  assert.ok(constraint.taktSeconds > 0)
  // Whatever the slowest station is, no station may be slower than it.
  for (const station of WORKING_STATIONS) {
    assert.ok(
      stationThroughputPerHour(station) >= constraint.throughputPerHour,
      `${station.id} is slower than the declared constraint`,
    )
  }
})

// ---------------------------------------------------------------------------------------------------------------
// Rule 4: line-stop detection in minutes
// ---------------------------------------------------------------------------------------------------------------

test('every station SLA is minutes, not hours', () => {
  for (const station of WORKING_STATIONS) {
    assert.ok(station.stationSlaSeconds > 0, `${station.id} has no SLA`)
    assert.ok(
      station.stationSlaSeconds <= 60 * 60,
      `${station.id} SLA of ${station.stationSlaSeconds}s is not a minutes-scale line-stop alarm`,
    )
    // It must still tolerate one unit of work plus a slow tick, or a working station reports itself stopped.
    assert.ok(
      station.stationSlaSeconds >= station.workSeconds + station.cadenceSeconds,
      `${station.id} SLA is shorter than its own work plus one tick`,
    )
  }
})

test('material waiting with no output past the station SLA is a line stop', () => {
  for (const station of WORKING_STATIONS) {
    const stops = decideLineStops({
      stations: [{
        station: station.id,
        waiting: 4,
        lastOutputAt: new Date(NOW.getTime() - (station.stationSlaSeconds + 60) * 1000).toISOString(),
        oldestWaitingSince: null,
      }],
      now: NOW,
    })
    assert.equal(stops.length, 1, `${station.id} holding work and producing nothing must be reported`)
    assert.equal(stops[0].station, station.id)
    assert.equal(stops[0].slaSeconds, station.stationSlaSeconds)
    assert.ok(stops[0].throughputPerHour > 0, 'a stop must say what the line is losing')
  }
})

test('an empty station is never a line stop, however long it has been quiet', () => {
  for (const station of WORKING_STATIONS) {
    assert.deepEqual(decideLineStops({
      stations: [{ station: station.id, waiting: 0, lastOutputAt: '2026-01-01T00:00:00.000Z', oldestWaitingSince: null }],
      now: NOW,
    }), [], `${station.id} with a drained queue must stay silent`)
  }
})

test('a station still inside its SLA is not a stop, so one slow tick is not an incident', () => {
  const station = stationById('EXACT_CANARY')!
  for (const idle of [0, 60, station.stationSlaSeconds - 1, station.stationSlaSeconds]) {
    assert.deepEqual(decideLineStops({
      stations: [{
        station: station.id,
        waiting: 3,
        lastOutputAt: new Date(NOW.getTime() - idle * 1000).toISOString(),
        oldestWaitingSince: null,
      }],
      now: NOW,
    }), [], `${idle}s of quiet is within the SLA`)
  }
})

test('a station that has never produced output is caught by its oldest unit', () => {
  const station = stationById('GRADUATION')!
  const stops = decideLineStops({
    stations: [{
      station: station.id,
      waiting: 7,
      lastOutputAt: null,
      oldestWaitingSince: new Date(NOW.getTime() - (station.stationSlaSeconds + 3600) * 1000).toISOString(),
    }],
    now: NOW,
  })
  assert.equal(stops.length, 1)
  assert.equal(stops[0].waiting, 7)
})

test('an unreadable or future clock reports nothing rather than inventing a line stop', () => {
  for (const [lastOutputAt, oldestWaitingSince] of [
    [null, null],
    ['not-a-date', 'also-not-a-date'],
    ['', ''],
    [new Date(NOW.getTime() + 86_400_000).toISOString(), null],
  ] as Array<[string | null, string | null]>) {
    assert.deepEqual(decideLineStops({
      stations: [{ station: 'EXACT_CANARY', waiting: 9, lastOutputAt, oldestWaitingSince }],
      now: NOW,
    }), [], `clock ${String(lastOutputAt)} must not produce a stop`)
  }
  assert.deepEqual(decideLineStops({
    stations: [{ station: 'EXACT_CANARY', waiting: 9, lastOutputAt: NOW.toISOString(), oldestWaitingSince: null }],
    now: new Date('nope'),
  }), [])
})

// ---------------------------------------------------------------------------------------------------------------
// The watchdog: a deadline that reports, and never starves the head of the line
// ---------------------------------------------------------------------------------------------------------------

test('a missed deadline becomes work instead of silence', () => {
  const plan = lifecyclePlan('evaluation_pending')!
  const entered = new Date('2026-10-02T20:00:00Z')
  const deadline = lifecycleDeadline(entered, plan)
  assert.equal(shouldOrchestrate({ now: new Date(deadline.getTime() - 1), deadlineAt: deadline.toISOString(), terminal: false }), false)
  assert.equal(shouldOrchestrate({ now: deadline, deadlineAt: deadline.toISOString(), terminal: false }), true)
})

test('action spacing prevents a retry storm while preserving durable retry', () => {
  assert.equal(shouldOrchestrate({
    now: new Date('2026-10-02T21:10:00Z'), deadlineAt: '2026-10-02T20:00:00Z', terminal: false, lastActionAt: '2026-10-02T21:08:00Z',
  }), false)
  assert.equal(shouldOrchestrate({
    now: new Date('2026-10-02T21:10:00Z'), deadlineAt: '2026-10-02T20:00:00Z', terminal: false, lastActionAt: '2026-10-02T21:00:00Z',
  }), true)
})

test('a real stage or artifact revision resets the lifecycle clock', () => {
  const evalPlan = lifecyclePlan('evaluation_pending')!
  assert.equal(stageChanged({ stage: 'EXACT_CANARY', artifact_hash: 'a'.repeat(64) }, evalPlan, 'a'.repeat(64)), true)
  assert.equal(stageChanged({ stage: 'INDEPENDENT_EVALUATION', artifact_hash: 'a'.repeat(64) }, evalPlan, 'b'.repeat(64)), true)
  assert.equal(stageChanged({ stage: 'INDEPENDENT_EVALUATION', artifact_hash: 'a'.repeat(64) }, evalPlan, 'a'.repeat(64)), false)
})

test('a unit deep in a queue is charged for the queue ahead of it, not declared broken', () => {
  // Twenty units ahead at a serial station is not a fault; it is twenty units ahead. Charging every unit the flat
  // head-of-queue deadline fills the overdue list with units nothing is wrong with, and the real stall hides in it.
  const canary = stationById('EXACT_CANARY')!
  assert.equal(expectedStartSeconds(canary, 0), 0)
  assert.equal(expectedStartSeconds(canary, 20), 20 * canary.workSeconds)
  assert.ok(unitDeadlineSeconds(canary, 20) > unitDeadlineSeconds(canary, 0))

  const entered = new Date('2026-10-02T19:00:00Z')
  const head = lifecycleDeadlineInQueue({ enteredAt: entered, status: 'evaluation_ready', queueAhead: 0 })!
  const deep = lifecycleDeadlineInQueue({ enteredAt: entered, status: 'evaluation_ready', queueAhead: 20 })!
  assert.ok(deep.getTime() > head.getTime())
  const start = lifecycleExpectedStart({ enteredAt: entered, status: 'evaluation_ready', queueAhead: 20 })!
  assert.ok(start.getTime() > entered.getTime(), 'a queued unit must be able to say when it should start')
  assert.equal(lifecycleDeadlineInQueue({ enteredAt: entered, status: 'not_a_status', queueAhead: 0 }), null)
})

test('a batched station charges a queue by ticks, not by one unit at a time', () => {
  const graduation = stationById('GRADUATION')!
  // Ten per tick: the first ten units are all in the next tick, so nine behind the head cost no extra wait.
  assert.equal(expectedStartSeconds(graduation, 9), 0)
  assert.equal(expectedStartSeconds(graduation, 10), graduation.cadenceSeconds)
})

test('a working station re-arms from its last action, so it can never be permanently overdue', () => {
  // The Production defect: WORKFORCE is nonterminal and was measured from arrival, so every active graduate became
  // permanently late the hour after it activated and the overdue list was nothing but working graduates.
  const workforce = lifecyclePlan('active')!
  assert.equal(workforce.recurring, true)
  const entered = new Date('2026-09-01T00:00:00Z')
  const acted = '2026-10-02T19:55:00Z'
  assert.equal(lifecycleDeadlineAnchor({ plan: workforce, enteredAt: entered, lastActionAt: acted }).toISOString(), new Date(acted).toISOString())
  // With no action yet it falls back to arrival, so a graduate nothing has ever looked at is still caught.
  assert.equal(lifecycleDeadlineAnchor({ plan: workforce, enteredAt: entered, lastActionAt: null }).getTime(), entered.getTime())

  // A waiting station must NOT re-arm, or its queue watchdog would reset every time the controller poked it.
  for (const status of ['evaluation_ready', 'evaluation_pending', 'quarantined', 'runtime_pending']) {
    const plan = lifecyclePlan(status)!
    assert.equal(plan.recurring, false, `${status} must keep measuring from arrival`)
    assert.equal(lifecycleDeadlineAnchor({ plan, enteredAt: entered, lastActionAt: acted }).getTime(), entered.getTime())
  }
})

test('a lease holds a lane for a bounded time and then frees it', () => {
  for (const station of WORKING_STATIONS) {
    assert.ok(leaseSeconds(station) >= station.cadenceSeconds, `${station.id} lease is shorter than its own tick`)
    assert.ok(leaseSeconds(station) >= 120)
  }
  assert.equal(leaseIsLive(new Date(NOW.getTime() + 60_000).toISOString(), NOW), true)
  assert.equal(leaseIsLive(new Date(NOW.getTime() - 1).toISOString(), NOW), false)
  // Unreadable or absent leases free the lane rather than parking it forever.
  assert.equal(leaseIsLive(null, NOW), false)
  assert.equal(leaseIsLive('not-a-date', NOW), false)
  assert.equal(leaseIsLive(NOW.toISOString(), new Date('nope')), false)
})

// ---------------------------------------------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------------------------------------------

test('controller owns progress but cannot grade or widen authority', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-lifecycle-orchestrator/route.ts', import.meta.url), 'utf8')
  assert.match(route, /every_nonterminal_artifact_has_a_named_next_action_and_deadline/)
  assert.match(route, /the_line_owns_the_flow_stations_own_only_their_own_authority/)
  assert.match(route, /authorityExpanded: false/)
  assert.doesNotMatch(route, /evaluationPassed\s*:\s*true/)
  assert.doesNotMatch(route, /productionTrafficAuthorized\s*:\s*true/)
  assert.doesNotMatch(route, /status:\s*['"]active['"]/)
  // It may write only the orchestration ledger. Writing the artifact or registry table would make it a promoter.
  assert.doesNotMatch(route, /from\('cos_local_distillation_artifacts'\)[\s\S]{0,120}?\.(update|upsert|insert)\(/)
  assert.doesNotMatch(route, /from\('cos_university_graduate_model_registry'\)/)
})

test('the line definition is pure policy with no database or network reach', () => {
  const line = readFileSync(new URL('../lib/ai/cos/cosUniversityAssemblyLine.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(line, /^import /m, 'the line definition must stay dependency-free')
  assert.doesNotMatch(line, /fetch\(/)
  assert.doesNotMatch(line, /cosServiceDb/)
})

test('the reconcile is batched, so its cost is chunks and not artifacts', () => {
  const route = readFileSync(new URL('../app/api/cron/cos-university-lifecycle-orchestrator/route.ts', import.meta.url), 'utf8')
  assert.match(route, /const RECONCILE_CHUNK = \d+/)
  assert.match(route, /rows\.slice\(offset, offset \+ RECONCILE_CHUNK\)/)
  assert.match(route, /\.upsert\(chunk, \{ onConflict: 'candidate_id' \}\)/)
  // One awaited write per artifact inside a 60-second budget running every minute is what this replaces.
  assert.doesNotMatch(route, /for \(const raw of source\.data[\s\S]{0,2000}?await db\.from\('cos_university_lifecycle_orchestration'\)\.upsert\(row,/)
})

test('migration persists stage ownership, deadline, queue position and lease', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261003003500_university_lifecycle_orchestration.sql', import.meta.url), 'utf8')
  assert.match(migration, /candidate_id text primary key/)
  assert.match(migration, /stage_entered_at timestamptz not null/)
  assert.match(migration, /stage_deadline_at timestamptz not null/)
  assert.match(migration, /orchestration_attempts integer not null/)
  assert.match(migration, /next_action text not null/)

  const queue = readFileSync(new URL('../supabase/migrations/20261003014000_university_assembly_line_queue.sql', import.meta.url), 'utf8')
  for (const column of ['station', 'queue_position', 'expected_start_at', 'lease_until', 'lease_holder', 'handoff_source']) {
    assert.match(queue, new RegExp(`add column if not exists ${column}\\b`), `${column} is not persisted`)
  }
  // Additive only: the ledger must not be dropped or rebuilt, and the grant must stay service_role.
  assert.doesNotMatch(queue, /drop (table|column)/i)
  assert.match(queue, /grant select, insert, update on public\.cos_university_lifecycle_orchestration to service_role/)
  assert.doesNotMatch(queue, /to (anon|authenticated)\b/)
})
// end of saas/tests/cosUniversityLifecycleOrchestrator.node.test.ts (if this line is missing, the paste was cut short)