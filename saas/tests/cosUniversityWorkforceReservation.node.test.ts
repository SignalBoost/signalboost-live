// saas/tests/cosUniversityWorkforceReservation.node.test.ts
//
// Production 2026-10-03 20:21 UTC, RunPod to the independent evaluator, six times in ninety minutes:
//   "Max workers across all endpoints must not exceed your workers quota (10) ... at most 0.
//    quota_inventory=holders=10:reserved=10:led-...(1/1,protected) x10"
// Seventeen active graduates, each pinned at max=1, held every slot the account has. The capacity model declared
// the workforce share as 2 of 10; nothing enforced it. These tests pin the enforcement.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  decideWorkforceReservation,
  WORKFORCE_WARM_WINDOW_ENV,
  describeWorkforceReservation,
  inWarmWindow,
  nextWarmWindowChange,
  parseWarmWindow,
  reconcileWorkforceReservation,
  resolveWarmWindow,
  unknownWorkforceReservation,
  type WorkforceGraduate,
} from '../lib/ai/cos/cosUniversityWorkforceReservation.ts'
import { lineCapacity, WORKER_QUOTA_ENV } from '../lib/ai/cos/cosUniversityLineCapacity.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const grad = (n: number, workersMax: number | null, lastAttemptAt: string | null, endpoint: string | null = `ep${n}`, workersMin: number | null = workersMax === null ? null : 0): WorkforceGraduate =>
  Object.freeze({ registryId: `reg${String(n).padStart(2, '0')}`, endpointId: endpoint, workersMax, workersMin, lastAttemptAt })

// The production shape: 17 on-call graduates, 10 of them holding a slot, a 10-worker account.
const production = (): WorkforceGraduate[] => Array.from({ length: 17 }, (_, i) =>
  grad(i + 1, i < 10 ? 1 : 0, i % 3 === 0 ? null : new Date(Date.UTC(2026, 9, 3, 10 + (i % 7), i)).toISOString()))

test('the production shape: 17 graduates on a 10-worker account end up with exactly the declared reserve pinned', () => {
  const reserve = lineCapacity({ [WORKER_QUOTA_ENV]: '10' }).workforce
  assert.equal(reserve, 2, 'the capacity model declares 2 of 10 for the workforce')
  const decision = decideWorkforceReservation({ graduates: production(), reserve })
  const pinnedAfter = decision.held.length + decision.pin.length
  const releasedAfter = decision.release.length + decision.idle.length
  assert.equal(pinnedAfter, 2)
  assert.equal(releasedAfter, 15)
  assert.equal(pinnedAfter + releasedAfter, 17)
  // Ten were holding slots. Whoever ranks inside the reserve keeps or gets one; every other holder gives it back
  // THIS tick, and the pool ends the tick at exactly the reserve - never more.
  assert.equal(decision.release.length + decision.held.length, 10, 'every current holder is either kept or released')
  assert.equal(decision.release.length, 10 - decision.held.length)
  assert.ok(decision.release.length >= 8, `at least eight slots return to the line (got ${decision.release.length})`)
})

test('ranking: never-used then least-recently-attempted graduates rotate into the bounded reserve', () => {
  const graduates = [
    grad(1, 1, null),
    grad(2, 1, '2026-10-03T19:00:00Z'),
    grad(3, 0, '2026-10-03T20:00:00Z'),
    grad(4, 1, '2026-10-03T18:00:00Z'),
  ]
  const decision = decideWorkforceReservation({ graduates, reserve: 2 })
  assert.deepEqual([...decision.pin], ['ep3'], 'the most recently useful graduate is pinned even though it was released')
  assert.deepEqual([...decision.held], ['ep2'])
  assert.deepEqual([...decision.release].sort(), ['ep1', 'ep4'])
  assert.deepEqual([...decision.idle], [])
  // Deterministic: identical input, identical decision, in either order.
  const reversed = decideWorkforceReservation({ graduates: [...graduates].reverse(), reserve: 2 })
  assert.deepEqual(reversed, decision)
})

test('a graduate without a RunPod endpoint, or whose endpoint RunPod did not list, is reported and never touched', () => {
  const decision = decideWorkforceReservation({
    graduates: [grad(1, 1, null), grad(2, null, null), grad(3, 1, null, null)],
    reserve: 1,
  })
  assert.deepEqual([...decision.unmanaged].sort(), ['reg02', 'reg03'])
  assert.deepEqual([...decision.held], ['ep1'])
  assert.deepEqual([...decision.release], [])
  // A reserve of zero releases everyone managed; a buyer with no workforce share gets no pinned graduates.
  const none = decideWorkforceReservation({ graduates: [grad(1, 1, null), grad(2, 1, null)], reserve: 0 })
  assert.deepEqual([...none.release].sort(), ['ep1', 'ep2'])
})

test('reconcile releases before it pins, survives a refused change, and reports exactly what happened', async () => {
  const calls: string[] = []
  const graduates = [grad(1, 1, null), grad(2, 1, null), grad(3, 0, '2026-10-03T20:00:00Z')]
  const report = await reconcileWorkforceReservation({
    env: { [WORKER_QUOTA_ENV]: '4' }, // workforce share of a 4-worker pool is 1
    ports: {
      listGraduates: async () => graduates,
      releaseWorker: async id => { calls.push(`release:${id}`); if (id === 'ep2') throw new Error('RunPod PATCH HTTP 400: refused') },
      pinWorker: async id => { calls.push(`pin:${id}`) },
      warmWorker: async () => undefined,
      coolWorker: async () => undefined,
    },
  })
  assert.equal(report.reserve, 1)
  assert.equal(report.onCall, 3)
  assert.equal(report.released, 1, 'one release succeeded')
  assert.equal(report.pinned, 1, 'the ranked graduate was pinned after the releases')
  assert.equal(report.errors.length, 1)
  assert.match(report.errors[0], /^release:ep2:RunPod PATCH HTTP 400: refused/)
  assert.ok(calls.indexOf('pin:ep3') > calls.indexOf('release:ep1'), 'releases run before pins so a rotation never asks for an extra slot')
  const line = describeWorkforceReservation(report)
  assert.match(line, /^workforce reserve=1 onCall=3 \| pinned=1 held=0 released=1 idle=0 unmanaged=0 \| eligibleForWork=1 \| window=none windowSource=none \| refused=1$/)
})

test('reconcile stops at its deadline and says so', async () => {
  const graduates = Array.from({ length: 6 }, (_, i) => grad(i + 1, 1, null))
  const report = await reconcileWorkforceReservation({
    env: { [WORKER_QUOTA_ENV]: '10' },
    deadlineMs: Date.now() + 25,
    ports: {
      listGraduates: async () => graduates,
      releaseWorker: async () => { await new Promise(r => setTimeout(r, 20)) },
      pinWorker: async () => undefined,
      warmWorker: async () => undefined,
      coolWorker: async () => undefined,
    },
  })
  assert.equal(report.deadlineReached, true)
  assert.ok(report.released < 4, `released ${report.released} of 4 before the deadline`)
  assert.match(describeWorkforceReservation(report), /deadline_reached$/)
})

test('the workforce station enforces the reservation first, through the existing slot transports, and reports it', () => {
  const route = read('../app/api/cron/cos-workforce-pipeline/route.ts')
  assert.match(route, /const reservation: WorkforceReservationReport = await readWorkforceWarmWindowSetting\(db\)\s*\.then\(setting => reconcileWorkforceReservation\(\{/)
  // Before any shadow work: the reconcile precedes the abandoned-assignment close that opens the rest of the tick.
  assert.ok(route.indexOf('reconcileWorkforceReservation({') < route.indexOf('closeAbandonedWorkforceAssignments()'))
  assert.match(route, /releaseWorker: endpointId => deactivateMassDistilledEvaluationWorker\(endpointId\)/)
  assert.match(route, /pinWorker: endpointId => ensureMassDistilledEndpoint24Gb\(endpointId\)/)
  assert.match(route, /warmWorker: endpointId => activateMassDistilledEvaluationWorker\(endpointId\)/)
  assert.match(route, /coolWorker: endpointId => coolMassDistilledWorker\(endpointId\)/)
  assert.match(route, /reservation: \{ \.\.\.reservation, summary: describeWorkforceReservation\(reservation\) \}/)
  assert.match(route, /console\.info\('\[cos-workforce-reservation\]', describeWorkforceReservation\(reservation\)\)/)
  // The ONLY place a worker is booted is the warm transport, and the module applies it only inside the reserve and the
  // window. No other boot path exists in the station.
  assert.equal((route.match(/\bactivateMassDistilledEvaluationWorker\(/g) || []).length, 1)
  assert.doesNotMatch(route, /\bactivateMassDistilledCanaryWorker/)
})

test('the reservation module is pure policy over an injected transport', () => {
  const source = read('../lib/ai/cos/cosUniversityWorkforceReservation.ts')
  assert.doesNotMatch(source, /fetch\(|cosServiceDb|requestV2/)
  assert.match(source, /import \{ lineCapacity \} from '\.\/cosUniversityLineCapacity\.ts'/)
  assert.equal((source.match(/^import /gm) || []).length, 1)
})
// ---------------------------------------------------------------------------------------------------------------
// Work goes only to graduates inside the reserve (Production 2026-10-04 00:15-02:15 UTC: 14 paid 45-second timeouts on
// 7 graduates the reconcile had just released; their workers still answered the health probe for a few seconds)
// ---------------------------------------------------------------------------------------------------------------
test('eligibility for work is exactly the reserve: released, idle and unmanaged graduates are excluded', () => {
  const graduates = [grad(1, 1, '2026-10-04T01:00:00Z'), grad(2, 0, '2026-10-04T02:00:00Z'), grad(3, 1, null), grad(4, 0, null), grad(5, null, null)]
  const decision = decideWorkforceReservation({ graduates, reserve: 2 })
  assert.deepEqual([...decision.eligibleForWork], ['reg02', 'reg01'], 'the two most recently useful, pinned or about to be')
  assert.deepEqual([...decision.excludedFromWork].sort(), ['reg03', 'reg04', 'reg05'])
  // Every on-call graduate is in exactly one of the two sets.
  assert.equal(decision.eligibleForWork.length + decision.excludedFromWork.length, graduates.length)
  // The production shape: 17 on call, reserve 2 -> 15 may never be handed a task this tick.
  const prod = decideWorkforceReservation({ graduates: production(), reserve: 2 })
  assert.equal(prod.eligibleForWork.length, 2)
  assert.equal(prod.excludedFromWork.length, 15)
})

test('a failed reconcile knows nobody, so nobody is eligible - no paid wake-up on a guess', () => {
  const report = unknownWorkforceReservation(new Error('RunPod GET /serverless HTTP 500'))
  assert.equal(report.eligibilityKnown, false)
  assert.deepEqual([...report.eligibleForWork], [])
  assert.match(report.errors[0], /^reconcile:RunPod GET \/serverless HTTP 500$/)
  assert.match(describeWorkforceReservation(report), /eligibleForWork=unknown/)
})

test('the workforce station hands practice work only to the reserve and gives out none when the reserve is unknown', () => {
  const route = read('../app/api/cron/cos-workforce-pipeline/route.ts')
  assert.match(route, /\.catch\(error => unknownWorkforceReservation\(error\)\)/)
  assert.match(route, /const offReserve = new Set\(reservation\.eligibilityKnown \? reservation\.excludedFromWork : \[\]\)/)
  assert.match(route, /const notEligibleForWork = new Set\(\[\.\.\.runtimeBlocked, \.\.\.offReserve\]\)/)
  assert.match(route, /const eligibleRecoveryTargets = reservation\.eligibilityKnown\s*\?[\s\S]{0,160}?!notEligibleForWork\.has\(String\(row\.registry_id\)\)\)\s*: \[\]/)
  assert.match(route, /const reservedForWork = new Set\(reservation\.eligibilityKnown \? reservation\.eligibleForWork : \[\]\)/)
  assert.match(route, /\}, objective, notEligibleForWork, reservedForWork\)/)
  assert.doesNotMatch(route, /\}, objective, runtimeBlocked\)/, 'the old exclusion set alone let released graduates receive work')
})
// ---------------------------------------------------------------------------------------------------------------
// Warm window (owner 2026-10-03, option 3): reserved graduates run inside a declared daily window, scale to zero outside
// ---------------------------------------------------------------------------------------------------------------
test('a warm window parses as HH:MM-HH:MM UTC, may cross midnight, and anything else is unset', () => {
  assert.deepEqual(parseWarmWindow('17:00-19:00'), { startMinute: 17 * 60, endMinute: 19 * 60, declared: '17:00-19:00' })
  assert.deepEqual(parseWarmWindow(' 22:30-02:15 '), { startMinute: 22 * 60 + 30, endMinute: 2 * 60 + 15, declared: '22:30-02:15' })
  for (const bad of [undefined, '', '17-19', '17:00', '25:00-26:00', '17:60-18:00', '17:00-17:00', '5pm-7pm', 'always']) {
    assert.equal(parseWarmWindow(bad), null, `${String(bad)} must not parse`)
  }
  const day = parseWarmWindow('17:00-19:00')!
  assert.equal(inWarmWindow(day, new Date('2026-10-04T16:59:00Z')), false)
  assert.equal(inWarmWindow(day, new Date('2026-10-04T17:00:00Z')), true)
  assert.equal(inWarmWindow(day, new Date('2026-10-04T18:59:00Z')), true)
  assert.equal(inWarmWindow(day, new Date('2026-10-04T19:00:00Z')), false, 'the end is exclusive')
  const night = parseWarmWindow('22:00-02:00')!
  assert.equal(inWarmWindow(night, new Date('2026-10-04T23:30:00Z')), true)
  assert.equal(inWarmWindow(night, new Date('2026-10-05T01:59:00Z')), true)
  assert.equal(inWarmWindow(night, new Date('2026-10-05T02:00:00Z')), false)
  assert.equal(inWarmWindow(night, new Date('2026-10-05T12:00:00Z')), false)
})

test('inside the window only the reserved graduates are warmed; outside it only warm reserved graduates are cooled', async () => {
  const calls: string[] = []
  const ports = {
    listGraduates: async () => [
      grad(1, 1, '2026-10-04T10:00:00Z', 'ep1', 0),   // reserved, cold -> warm inside
      grad(2, 1, '2026-10-04T09:00:00Z', 'ep2', 1),   // reserved, already warm -> untouched inside, cooled outside
      grad(3, 0, null, 'ep3', 0),                      // outside the reserve: never warmed
      grad(4, 1, null, 'ep4', 1),                      // outside the reserve and warm: RELEASED (max 0), never cooled
    ],
    releaseWorker: async (id: string) => { calls.push(`release:${id}`) },
    pinWorker: async (id: string) => { calls.push(`pin:${id}`) },
    warmWorker: async (id: string) => { calls.push(`warm:${id}`) },
    coolWorker: async (id: string) => { calls.push(`cool:${id}`) },
  }
  const env = { [WORKER_QUOTA_ENV]: '10', [WORKFORCE_WARM_WINDOW_ENV]: '17:00-19:00' } // reserve 2

  const inside = await reconcileWorkforceReservation({ ports, env, now: new Date('2026-10-04T17:30:00Z') })
  assert.equal(inside.window, '17:00-19:00')
  assert.equal(inside.inWindow, true)
  assert.equal(inside.warmed, 1)
  assert.equal(inside.cooled, 0)
  assert.deepEqual(calls.filter(c => c.startsWith('warm')), ['warm:ep1'])
  assert.deepEqual(calls.filter(c => c.startsWith('release')), ['release:ep4'])
  assert.ok(calls.indexOf('release:ep4') < calls.indexOf('warm:ep1'), 'slots are given back before any worker is started')
  assert.match(describeWorkforceReservation(inside), /window=17:00-19:00 windowSource=env inWindow=true warmed=1 cooled=0$/)

  calls.length = 0
  const outside = await reconcileWorkforceReservation({ ports, env, now: new Date('2026-10-04T20:00:00Z') })
  assert.equal(outside.inWindow, false)
  assert.equal(outside.warmed, 0)
  assert.equal(outside.cooled, 1)
  assert.deepEqual(calls.filter(c => c.startsWith('cool')), ['cool:ep2'])
  assert.deepEqual(calls.filter(c => c.startsWith('warm')), [])
})

test('with no window declared nothing is warmed or cooled - today\'s behavior, no spend', async () => {
  const calls: string[] = []
  const report = await reconcileWorkforceReservation({
    env: { [WORKER_QUOTA_ENV]: '10' },
    now: new Date('2026-10-04T17:30:00Z'),
    ports: {
      listGraduates: async () => [grad(1, 1, null, 'ep1', 0), grad(2, 1, null, 'ep2', 0)],
      releaseWorker: async () => undefined,
      pinWorker: async () => undefined,
      warmWorker: async (id: string) => { calls.push(`warm:${id}`) },
      coolWorker: async (id: string) => { calls.push(`cool:${id}`) },
    },
  })
  assert.equal(report.window, null)
  assert.equal(report.inWindow, null)
  assert.deepEqual(calls, [])
  assert.match(describeWorkforceReservation(report), /window=none windowSource=none$/)
  // An unusable declaration is the same as none, never a guess.
  const bad = await reconcileWorkforceReservation({
    env: { [WORKER_QUOTA_ENV]: '10', [WORKFORCE_WARM_WINDOW_ENV]: 'always' },
    ports: { listGraduates: async () => [], releaseWorker: async () => undefined, pinWorker: async () => undefined, warmWorker: async () => undefined, coolWorker: async () => undefined },
  })
  assert.equal(bad.window, null)
})

test('precedence: the buyer\'s stored window beats the environment, an unusable stored window is none (not the env), nothing stored falls back to env', () => {
  const env = { [WORKFORCE_WARM_WINDOW_ENV]: '14:00-16:00' }
  assert.deepEqual(resolveWarmWindow({ setting: '17:00-19:00', env }), { window: parseWarmWindow('17:00-19:00'), source: 'setting' })
  assert.deepEqual(resolveWarmWindow({ setting: 'always', env }), { window: null, source: 'setting' })
  assert.deepEqual(resolveWarmWindow({ setting: null, env }), { window: parseWarmWindow('14:00-16:00'), source: 'env' })
  assert.deepEqual(resolveWarmWindow({ setting: '   ', env }), { window: parseWarmWindow('14:00-16:00'), source: 'env' })
  assert.deepEqual(resolveWarmWindow({ setting: undefined, env: {} }), { window: null, source: 'none' })
})

test('the reconcile applies the stored window over the environment and reports where it came from', async () => {
  const calls: string[] = []
  const ports = {
    listGraduates: async () => [grad(1, 1, null, 'ep1', 0)],
    releaseWorker: async () => undefined,
    pinWorker: async () => undefined,
    warmWorker: async (id: string) => { calls.push(`warm:${id}`) },
    coolWorker: async (id: string) => { calls.push(`cool:${id}`) },
  }
  // Env says 14-16 (closed at 17:30); the buyer stored 17-19 (open). The buyer wins: ep1 is warmed.
  const report = await reconcileWorkforceReservation({
    ports,
    env: { [WORKER_QUOTA_ENV]: '10', [WORKFORCE_WARM_WINDOW_ENV]: '14:00-16:00' },
    warmWindowSetting: '17:00-19:00',
    now: new Date('2026-10-04T17:30:00Z'),
  })
  assert.equal(report.window, '17:00-19:00')
  assert.equal(report.windowSource, 'setting')
  assert.deepEqual(calls, ['warm:ep1'])
  assert.match(describeWorkforceReservation(report), /window=17:00-19:00 windowSource=setting inWindow=true warmed=1 cooled=0$/)
  assert.equal(unknownWorkforceReservation(new Error('x')).windowSource, 'none')
})

test('the next window change is computed for the page: closes-at inside, opens-at outside, crossing midnight', () => {
  const window = parseWarmWindow('22:00-02:00')!
  assert.deepEqual(nextWarmWindowChange(window, new Date('2026-10-04T23:00:00Z')), { opensAt: null, closesAt: '2026-10-05T02:00:00.000Z' })
  assert.deepEqual(nextWarmWindowChange(window, new Date('2026-10-04T10:00:00Z')), { opensAt: '2026-10-04T22:00:00.000Z', closesAt: null })
  const day = parseWarmWindow('14:00-16:00')!
  assert.deepEqual(nextWarmWindowChange(day, new Date('2026-10-04T17:00:00Z')), { opensAt: '2026-10-05T14:00:00.000Z', closesAt: null })
})

test('the cool transport returns a graduate to scale-to-zero with its slot kept, and the route reads min workers', () => {
  const v2 = read('../lib/ai/cos/runpodMassDistilledProvisionV2.ts')
  assert.match(v2, /export async function coolMassDistilledWorker\(endpointId: string\)[\s\S]{0,400}?workers: \{ min: 0, max: 1, idleTimeout: IDLE_TIMEOUT_SECONDS \}/)
  assert.match(v2, /mass_distilled_worker_cool_rejected/)
  const route = read('../app/api/cron/cos-workforce-pipeline/route.ts')
  assert.match(route, /readWorkforceWarmWindowSetting\(db\)\s*\.then\(setting => reconcileWorkforceReservation\(\{\s*warmWindowSetting: setting\.value,/)
  assert.match(route, /minByEndpoint\.set\(id, Math\.max\(0, Math\.floor\(Number\(endpoint\.workers\?\.min \?\? 0\)\)\)\)/)
  assert.match(route, /workersMin: endpointId && minByEndpoint\.has\(endpointId\)/)
})
// end of saas/tests/cosUniversityWorkforceReservation.node.test.ts (if this line is missing, the paste was cut short)
