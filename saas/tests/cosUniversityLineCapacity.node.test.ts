// saas/tests/cosUniversityLineCapacity.node.test.ts
//
// Owner, 2026-10-03, the exact specification this file implements:
//
//   "A test suite that proves:
//      - Unset -> fallback = 10, telemetry = undeclared_fallback
//      - Quota set -> telemetry = runpod_quota
//      - Override set -> telemetry = university_override
//      - Contradiction -> override wins, telemetry = university_override
//      - Regression guard -> build fails if fallback literal changes"
//
// Background: the capacity model shipped earlier the same day invented a parallel default of 256 while the
// provisioner already read `process.env.RUNPOD_SERVERLESS_WORKER_QUOTA || '10'`. One fact, two answers, disagreeing
// by 25x. These tests lock the single resolution order and the telemetry that names its winner.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  INFERENCE_WORKERS_ENV,
  MAXIMUM_WORKER_POOL,
  MINIMUM_WORKER_POOL,
  UNDECLARED_WORKER_FALLBACK,
  WORKER_QUOTA_ENV,
  describeLineCapacity,
  lineCapacity,
  resolveWorkerPool,
} from '../lib/ai/cos/cosUniversityLineCapacity.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const PROVISIONERS = [
  '../lib/ai/cos/runpodMassDistilledProvision.ts',
  '../lib/ai/cos/runpodMassDistilledProvisionV2.ts',
]

// ---------------------------------------------------------------------------------------------------------------
// 1. Unset -> fallback = 10, telemetry = undeclared_fallback
// ---------------------------------------------------------------------------------------------------------------
test('unset: the pool falls back to 10 and telemetry says undeclared_fallback', () => {
  const pool = resolveWorkerPool({})
  assert.equal(pool.workers, 10)
  assert.equal(pool.workers, UNDECLARED_WORKER_FALLBACK)
  assert.equal(pool.source, 'undeclared_fallback')
  assert.equal(pool.declared, false)
  assert.equal(pool.sourceEnv, null, 'nothing was declared, so no variable may be credited')
  assert.equal(pool.contradicted, false)

  const capacity = lineCapacity({})
  assert.equal(capacity.workers, 10)
  assert.equal(capacity.source, 'undeclared_fallback')
  // An undeclared deployment must stay inside the pool the provisioner believes in.
  assert.ok(capacity.canary + capacity.evaluation + capacity.workforce < UNDECLARED_WORKER_FALLBACK)

  const telemetry = describeLineCapacity(capacity)
  assert.match(telemetry, /^workers=10 source=undeclared_fallback \(10, matching the provisioner;/)
  assert.doesNotMatch(telemetry, /source=runpod_quota|source=university_override/)
})

// ---------------------------------------------------------------------------------------------------------------
// 2. Quota set -> telemetry = runpod_quota
// ---------------------------------------------------------------------------------------------------------------
test('quota set: the pool is the quota and telemetry says runpod_quota', () => {
  const pool = resolveWorkerPool({ [WORKER_QUOTA_ENV]: '256' })
  assert.equal(pool.workers, 256)
  assert.equal(pool.source, 'runpod_quota')
  assert.equal(pool.declared, true)
  assert.equal(pool.sourceEnv, WORKER_QUOTA_ENV)
  assert.equal(pool.contradicted, false)

  const telemetry = describeLineCapacity(lineCapacity({ [WORKER_QUOTA_ENV]: '256' }))
  assert.match(telemetry, /^workers=256 source=runpod_quota \(RUNPOD_SERVERLESS_WORKER_QUOTA\)/)
})

// ---------------------------------------------------------------------------------------------------------------
// 3. Override set -> telemetry = university_override
// ---------------------------------------------------------------------------------------------------------------
test('override set: the pool is the override and telemetry says university_override', () => {
  const pool = resolveWorkerPool({ [INFERENCE_WORKERS_ENV]: '64' })
  assert.equal(pool.workers, 64)
  assert.equal(pool.source, 'university_override')
  assert.equal(pool.declared, true)
  assert.equal(pool.sourceEnv, INFERENCE_WORKERS_ENV)
  // Only the override was set, so there is nothing to contradict.
  assert.equal(pool.contradicted, false)

  const telemetry = describeLineCapacity(lineCapacity({ [INFERENCE_WORKERS_ENV]: '64' }))
  assert.match(telemetry, /^workers=64 source=university_override \(COS_UNIVERSITY_INFERENCE_WORKERS\)/)
  assert.doesNotMatch(telemetry, /overriding/, 'nothing was overridden, so nothing may be claimed')
})

// ---------------------------------------------------------------------------------------------------------------
// 4. Contradiction -> override wins, telemetry = university_override
// ---------------------------------------------------------------------------------------------------------------
test('contradiction: the override wins, and telemetry names what it overrode', () => {
  // This is the exact shape of the defect: both variables set, disagreeing. It must resolve one way, every time,
  // and say so - a silent winner is how 10 and 256 coexisted for a day.
  const pool = resolveWorkerPool({ [INFERENCE_WORKERS_ENV]: '64', [WORKER_QUOTA_ENV]: '256' })
  assert.equal(pool.workers, 64, 'the override must win')
  assert.equal(pool.source, 'university_override')
  assert.equal(pool.sourceEnv, INFERENCE_WORKERS_ENV)
  assert.equal(pool.contradicted, true, 'a disagreement must be reported, never hidden')

  const telemetry = describeLineCapacity(lineCapacity({ [INFERENCE_WORKERS_ENV]: '64', [WORKER_QUOTA_ENV]: '256' }))
  assert.match(telemetry, /^workers=64 source=university_override \(COS_UNIVERSITY_INFERENCE_WORKERS\) overriding RUNPOD_SERVERLESS_WORKER_QUOTA/)
  assert.doesNotMatch(telemetry, /workers=256/, 'the losing declaration must never appear as the pool')

  // The resolution order is total: the same inputs always produce the same winner, in either declaration order.
  assert.equal(resolveWorkerPool({ [WORKER_QUOTA_ENV]: '256', [INFERENCE_WORKERS_ENV]: '64' }).workers, 64)
})

// ---------------------------------------------------------------------------------------------------------------
// 5. Regression guard -> build fails if the fallback literal changes
// ---------------------------------------------------------------------------------------------------------------
test('regression guard: the fallback is pinned to the provisioner literal in both provisioners', () => {
  // This is the guard that would have caught the original defect at build time. If either provisioner's fallback
  // moves, UNDECLARED_WORKER_FALLBACK must move with it or the build stops here.
  for (const provisioner of PROVISIONERS) {
    const source = read(provisioner)
    assert.match(source, new RegExp(`process\\.env\\.${WORKER_QUOTA_ENV}`),
      `${provisioner} must read the same variable the line is sized from`)
    assert.match(source, new RegExp(`${WORKER_QUOTA_ENV}\\s*\\|\\|\\s*'${UNDECLARED_WORKER_FALLBACK}'`),
      `${provisioner} fallback no longer matches UNDECLARED_WORKER_FALLBACK=${UNDECLARED_WORKER_FALLBACK}`)
  }
  assert.equal(UNDECLARED_WORKER_FALLBACK, 10)
})

test('regression guard: capacity reads exactly these two variables and nothing else', () => {
  // A third name for the same fact is the defect returning under a new spelling.
  const source = read('../lib/ai/cos/cosUniversityLineCapacity.ts')
  const envReads = [...source.matchAll(/env\[([A-Za-z_]+)\]/g)].map(match => match[1])
  assert.deepEqual([...new Set(envReads)].sort(), ['INFERENCE_WORKERS_ENV', 'WORKER_QUOTA_ENV'])
  // Only one function may resolve the pool, so there is one place a contradiction can be decided.
  assert.equal((source.match(/export function resolveWorkerPool/g) || []).length, 1)
  assert.match(source, /export function lineCapacity[\s\S]{0,200}?resolveWorkerPool\(env\)/,
    'lineCapacity must size stations from the single resolution, not re-read the environment')
})

// ---------------------------------------------------------------------------------------------------------------
// Invariants that make raising the pool safe
// ---------------------------------------------------------------------------------------------------------------
test('every pool size keeps a spare worker and keeps the exam writer ahead of the canary', () => {
  for (const declared of ['4', '5', '7', '10', '16', '32', '64', '100', '256', '1000', '100000']) {
    const capacity = lineCapacity({ [WORKER_QUOTA_ENV]: declared })
    assert.ok(capacity.canary >= 1 && capacity.evaluation >= 1 && capacity.workforce >= 1 && capacity.activation >= 1,
      `pool ${declared} starved a station`)
    assert.ok(capacity.canary + capacity.evaluation + capacity.workforce < capacity.workers,
      `pool ${declared} reserved the whole worker pool`)
    assert.ok(capacity.headroom >= 1, `pool ${declared} left no headroom`)
    // A canary that outruns the exam writer is the line stop of 2026-10-03.
    assert.ok(capacity.examSetsPerTick > capacity.canary, `pool ${declared} lets the canary outrun the exam writer`)
  }
})

test('a declared pool scales the whole line from that one change', () => {
  const small = lineCapacity({ [WORKER_QUOTA_ENV]: '10' })
  const enterprise = lineCapacity({ [WORKER_QUOTA_ENV]: '256' })
  assert.ok(enterprise.canary > small.canary && enterprise.evaluation > small.evaluation)
  assert.ok(enterprise.artifactsPerHour > small.artifactsPerHour * 10,
    'declaring a real pool must scale the line, not nudge it')
})

test('an unusable declaration degrades to the fallback instead of being guessed at', () => {
  for (const raw of ['0', '-5', '', '  ', 'lots', '3.5', 'NaN']) {
    for (const name of [WORKER_QUOTA_ENV, INFERENCE_WORKERS_ENV]) {
      const pool = resolveWorkerPool({ [name]: raw })
      assert.equal(pool.workers, UNDECLARED_WORKER_FALLBACK, `${name}=${raw} must fall back`)
      assert.equal(pool.source, 'undeclared_fallback')
    }
  }
  assert.equal(resolveWorkerPool({ [WORKER_QUOTA_ENV]: '1' }).workers, MINIMUM_WORKER_POOL)
  assert.equal(resolveWorkerPool({ [WORKER_QUOTA_ENV]: '99999999' }).workers, MAXIMUM_WORKER_POOL)
})

test('telemetry matches the code exactly: every figure is read off the sized object', () => {
  // "like a doctor's thermometer" - a reader can never be shown a number the line is not running.
  for (const env of [{}, { [WORKER_QUOTA_ENV]: '256' }, { [INFERENCE_WORKERS_ENV]: '64', [WORKER_QUOTA_ENV]: '256' }]) {
    const capacity = lineCapacity(env)
    const telemetry = describeLineCapacity(capacity)
    for (const [label, value] of [
      ['workers', capacity.workers], ['canary', capacity.canary], ['evaluation', capacity.evaluation],
      ['activation', capacity.activation], ['workforce', capacity.workforce], ['headroom', capacity.headroom],
      ['canaryApprovalsPerHour', capacity.canaryApprovalsPerHour], ['examSetsPerTick', capacity.examSetsPerTick],
      ['artifactsPerHour', capacity.artifactsPerHour],
    ] as Array<[string, number]>) {
      assert.ok(telemetry.includes(`${label}=${value}`), `telemetry omits or misstates ${label} for ${JSON.stringify(env)}`)
    }
  }
})

test('the capacity model is pure policy with no database or network reach', () => {
  const source = read('../lib/ai/cos/cosUniversityLineCapacity.ts')
  assert.doesNotMatch(source, /^import /m, 'the capacity model must stay dependency-free')
  assert.doesNotMatch(source, /fetch\(/)
  assert.doesNotMatch(source, /cosServiceDb/)
  assert.match(source, /authorityExpanded: false/)
})
// end of saas/tests/cosUniversityLineCapacity.node.test.ts (if this line is missing, the paste was cut short)
