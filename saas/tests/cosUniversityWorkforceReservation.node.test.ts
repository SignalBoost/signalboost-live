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
  describeWorkforceReservation,
  reconcileWorkforceReservation,
  type WorkforceGraduate,
} from '../lib/ai/cos/cosUniversityWorkforceReservation.ts'
import { lineCapacity, WORKER_QUOTA_ENV } from '../lib/ai/cos/cosUniversityLineCapacity.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const grad = (n: number, workersMax: number | null, lastAttemptAt: string | null, endpoint: string | null = `ep${n}`): WorkforceGraduate =>
  Object.freeze({ registryId: `reg${String(n).padStart(2, '0')}`, endpointId: endpoint, workersMax, lastAttemptAt })

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

test('ranking: the most recently useful graduates keep their slots; never-used ones give theirs back first', () => {
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
  assert.match(line, /^workforce reserve=1 onCall=3 \| pinned=1 held=0 released=1 idle=0 unmanaged=0 \| refused=1$/)
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
    },
  })
  assert.equal(report.deadlineReached, true)
  assert.ok(report.released < 4, `released ${report.released} of 4 before the deadline`)
  assert.match(describeWorkforceReservation(report), /deadline_reached$/)
})

test('the workforce station enforces the reservation first, through the existing slot transports, and reports it', () => {
  const route = read('../app/api/cron/cos-workforce-pipeline/route.ts')
  assert.match(route, /const reservation: WorkforceReservationReport = await reconcileWorkforceReservation\(/)
  // Before any shadow work: the reconcile precedes the abandoned-assignment close that opens the rest of the tick.
  assert.ok(route.indexOf('reconcileWorkforceReservation({') < route.indexOf('closeAbandonedWorkforceAssignments()'))
  assert.match(route, /releaseWorker: endpointId => deactivateMassDistilledEvaluationWorker\(endpointId\)/)
  assert.match(route, /pinWorker: endpointId => ensureMassDistilledEndpoint24Gb\(endpointId\)/)
  assert.match(route, /reservation: \{ \.\.\.reservation, summary: describeWorkforceReservation\(reservation\) \}/)
  assert.match(route, /console\.info\('\[cos-workforce-reservation\]', describeWorkforceReservation\(reservation\)\)/)
  // Standing owner rule: nothing here boots a graduate. Pinning restores max=1 with min=0 - a held slot, not a worker.
  assert.doesNotMatch(route, /\bactivateMassDistilledEvaluationWorker|\bactivateMassDistilledCanaryWorker/)
})

test('the reservation module is pure policy over an injected transport', () => {
  const source = read('../lib/ai/cos/cosUniversityWorkforceReservation.ts')
  assert.doesNotMatch(source, /fetch\(|cosServiceDb|requestV2/)
  assert.match(source, /import \{ lineCapacity \} from '\.\/cosUniversityLineCapacity\.ts'/)
  assert.equal((source.match(/^import /gm) || []).length, 1)
})
// end of saas/tests/cosUniversityWorkforceReservation.node.test.ts (if this line is missing, the paste was cut short)
