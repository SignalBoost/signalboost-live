import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { declaredInferenceWorkers, lineCapacity, describeLineCapacity } from '../lib/ai/cos/cosUniversityLineCapacity.ts'

test('existing settings resolve once: override, quota, then fallback 10', () => {
  const cases = [
    [{}, 10, 'fallback'],
    [{ RUNPOD_SERVERLESS_WORKER_QUOTA: '40' }, 40, 'quota'],
    [{ COS_UNIVERSITY_INFERENCE_WORKERS: '256', RUNPOD_SERVERLESS_WORKER_QUOTA: '10' }, 256, 'override'],
    [{ COS_UNIVERSITY_INFERENCE_WORKERS: 'invalid', RUNPOD_SERVERLESS_WORKER_QUOTA: '20' }, 20, 'quota'],
    [{ COS_UNIVERSITY_INFERENCE_WORKERS: '0', RUNPOD_SERVERLESS_WORKER_QUOTA: '1.5' }, 10, 'fallback'],
    [{ COS_UNIVERSITY_INFERENCE_WORKERS: ' 64 ' }, 64, 'override'],
  ] as const
  for (const [env, workers, source] of cases) {
    assert.deepEqual(declaredInferenceWorkers(env), { workers, source })
    const capacity = lineCapacity(env)
    assert.equal(capacity.workers, workers)
    assert.equal(capacity.source, source)
    assert.match(describeLineCapacity(capacity), new RegExp(`^${workers} inference workers \\(${source}\\)`))
    assert.ok(Object.isFrozen(capacity))
  }
})

test('malformed settings cannot create fictitious capacity', () => {
  for (const value of ['', ' ', '-2', '0', '1.5', '10workers', 'Infinity', 'NaN', '9007199254740992']) {
    assert.deepEqual(declaredInferenceWorkers({ COS_UNIVERSITY_INFERENCE_WORKERS: value }), { workers: 10, source: 'fallback' })
  }
  for (const value of ['1', '2', '3', '100001']) {
    for (const key of ['COS_UNIVERSITY_INFERENCE_WORKERS', 'RUNPOD_SERVERLESS_WORKER_QUOTA']) {
      assert.throws(() => declaredInferenceWorkers({ [key]: value }), /capacity_out_of_range/)
    }
  }
})

test('all supported sizes preserve headroom without inventing workers', () => {
  for (const workers of [4, 5, 10, 32, 256, 1024, 100000]) {
    for (const reserve of [undefined, '1', '999999']) {
      const c = lineCapacity({ RUNPOD_SERVERLESS_WORKER_QUOTA: String(workers), COS_UNIVERSITY_WORKFORCE_RESERVE_WORKERS: reserve })
      assert.equal(c.workers, workers)
      assert.equal(c.workforce + c.canary + c.evaluation + c.headroom, workers)
      assert.ok(c.canary >= 1 && c.evaluation >= 1 && c.headroom >= 1)
      assert.ok(c.activation <= c.workforce)
    }
  }
})

test('the actual scheduler and provider telemetry agree under each source', () => {
  // Fresh processes also test module-load station constants against the same configured pool.
  for (const [override, quota, workers, source] of [
    ['', '', 10, 'fallback'], ['', '40', 40, 'quota'], ['256', '10', 256, 'override'],
  ] as const) {
    const script = `
      import assert from 'node:assert/strict'
      import { UNIVERSITY_LINE_CAPACITY, stationById } from './lib/ai/cos/cosUniversityAssemblyLine.ts'
      import { massDistilledServerlessWorkerCapacity } from './lib/ai/cos/runpodMassDistilledProvisionV2.ts'
      globalThis.fetch = async () => new Response(JSON.stringify({endpoints:[{workers:{max:2}},{workers:{max:3}}]}))
      const observed = await massDistilledServerlessWorkerCapacity()
      assert.deepEqual(observed, {quota:${workers},source:'${source}',reservedWorkers:5,availableWorkers:${workers - 5}})
      assert.equal(UNIVERSITY_LINE_CAPACITY.workers, observed.quota)
      assert.equal(UNIVERSITY_LINE_CAPACITY.source, observed.source)
      assert.equal(stationById('EXACT_CANARY').concurrency, UNIVERSITY_LINE_CAPACITY.canary)
      assert.equal(stationById('INDEPENDENT_EVALUATION').concurrency, UNIVERSITY_LINE_CAPACITY.evaluation)
      globalThis.fetch = async () => new Response(JSON.stringify({endpoints:[{workers:{max:${workers + 1}}}]}))
      assert.equal((await massDistilledServerlessWorkerCapacity()).availableWorkers, 0)
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('../', import.meta.url), encoding: 'utf8',
      env: { ...process.env, RUNPOD_API_KEY: 'test-only', COS_UNIVERSITY_INFERENCE_WORKERS: override, RUNPOD_SERVERLESS_WORKER_QUOTA: quota },
    })
    assert.equal(result.status, 0, result.stderr)
  }
})

test('all provisioner preflights use the resolver and the production gate enforces this suite', () => {
  for (const name of ['runpodMassDistilledProvision.ts', 'runpodMassDistilledProvisionV2.ts']) {
    const code = readFileSync(new URL(`../lib/ai/cos/${name}`, import.meta.url), 'utf8')
    assert.match(code, /declaredInferenceWorkers\(\)/)
    assert.doesNotMatch(code, /RUNPOD_SERVERLESS_WORKER_QUOTA|configuredServerlessWorkerQuota|configuredQuota/)
  }
  const route = readFileSync(new URL('../app/api/cron/cos-university-lifecycle-orchestrator/route.ts', import.meta.url), 'utf8')
  assert.match(route, /capacity: UNIVERSITY_LINE_CAPACITY/)
  const ownerTelemetry = readFileSync(new URL('../app/api/admin/cos-university-telemetry/route.ts', import.meta.url), 'utf8')
  assert.match(ownerTelemetry, /capacity: UNIVERSITY_LINE_CAPACITY/)
  const gate = readFileSync(new URL('../scripts/vercel-cos-gates.mjs', import.meta.url), 'utf8')
  assert.match(gate, /tests\/cosUniversityLineCapacity.node.test.ts/)
})
