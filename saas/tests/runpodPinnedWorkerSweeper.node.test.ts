// saas/tests/runpodPinnedWorkerSweeper.node.test.ts
//
// Owner report 2026-09-29: 26 RunPod "always on billing" notices in one day ($0.59-$0.94/hour each). Exams and
// canaries pin min=1 and set it back when they finish; a killed run never did, and nothing released it. These
// tests lock the sweeper: orphans go back to min=0, live work is never touched, graduates stay ready.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PINNED_WORKER_SWEEP_MAX_RELEASES, planPinnedWorkerRelease } from '../lib/ai/cos/runpodPinnedWorkerSweeper.ts'

const none = { graduateIds: new Set<string>(), evaluationIds: new Set<string>(), canaryIds: new Set<string>(), residencyNames: new Set<string>() }
const endpoint = (id: string, min: number, max = 1, name = `itmounts-mass-distilled-${id}-abc-v5`) =>
  ({ id, name, workers: { min, max, idleTimeout: 60 } })

test('an orphaned always-on student endpoint goes back to min=0 and releases its worker slot', () => {
  const plan = planPinnedWorkerRelease([endpoint('orphan1', 1)], none)
  assert.equal(plan.releases.length, 1)
  assert.deepEqual({ ...plan.releases[0] }, {
    endpointId: 'orphan1', endpointName: 'itmounts-mass-distilled-orphan1-abc-v5',
    fromMin: 1, fromMax: 1, toMin: 0, toMax: 0, idleTimeout: 60, graduate: false,
  })
})

test('a live exam, canary or Residency case is never touched', () => {
  const live = {
    ...none,
    evaluationIds: new Set(['exam1']),
    canaryIds: new Set(['canary1']),
    residencyNames: new Set(['itmounts-mass-distilled-res1-abc-v5']),
  }
  const plan = planPinnedWorkerRelease([endpoint('exam1', 1), endpoint('canary1', 1), endpoint('res1', 1)], live)
  assert.equal(plan.releases.length, 0)
  assert.deepEqual([...plan.keptLive], ['exam1', 'canary1', 'res1'])
})

test('a pinned graduate goes back to sleep but stays ready (max stays 1)', () => {
  const plan = planPinnedWorkerRelease([endpoint('grad1', 1)], { ...none, graduateIds: new Set(['grad1']) })
  assert.equal(plan.releases[0].graduate, true)
  assert.equal(plan.releases[0].toMin, 0)
  assert.equal(plan.releases[0].toMax, 1)
})

test('only the itmounts-mass-distilled family, and only endpoints actually pinned', () => {
  const plan = planPinnedWorkerRelease([
    endpoint('asleep', 0),
    endpoint('primary', 1, 1, 'itmounts-distilled-reasoning-primary'),
    endpoint('other', 2, 2, 'someone-else-endpoint'),
  ], none)
  assert.equal(plan.releases.length, 0)
  assert.equal(plan.keptLive.length, 0)
})

test('bounded per run, and a missing idle timeout falls back to the governed default', () => {
  const many = Array.from({ length: PINNED_WORKER_SWEEP_MAX_RELEASES + 5 }, (_, i) => endpoint(`o${i}`, 1))
  assert.equal(planPinnedWorkerRelease(many, none).releases.length, PINNED_WORKER_SWEEP_MAX_RELEASES)
  const noIdle = planPinnedWorkerRelease([{ id: 'x', name: 'itmounts-mass-distilled-x-v5', workers: { min: 1, max: 1 } }], none)
  assert.ok(noIdle.releases[0].idleTimeout > 0)
})

test('the sweeper fails closed, re-checks live work before each change, and never raises capacity', () => {
  const source = readFileSync(new URL('../lib/ai/cos/runpodPinnedWorkerSweeper.ts', import.meta.url), 'utf8')
  assert.match(source, /const live = await readLiveWork\(now\)/)
  assert.match(source, /const recheck = plan\.releases\.length \? await readLiveWork\(new Date\(\)\) : live/)
  assert.match(source, /workers: \{ min: 0, max: release\.toMax, idleTimeout: release\.idleTimeout \}/)
  assert.doesNotMatch(source, /min: 1/)
})

test('the 5-minute GC cron runs the sweep first and independently of garbage collection', () => {
  const route = readFileSync(new URL('../app/api/cron/runpod-terminal-endpoint-gc/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('await sweepPinnedWorkers()') < route.indexOf('await garbageCollectTerminalMassDistilledEndpoints()'))
  assert.match(route, /lane: SWEEP_LANE/)
  assert.match(route, /return \{ error: message \}/, 'a failed sweep never stops garbage collection')
})
