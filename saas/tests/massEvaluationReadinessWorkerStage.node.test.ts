// saas/tests/massEvaluationReadinessWorkerStage.node.test.ts
//
// Production 2026-10-04/05: 62 evaluations across 47 artifacts failed as runtime_not_ready:gateway_ping_timeout with no
// way to tell "RunPod never gave a worker" from "the worker never finished loading" from "the worker ran but the gateway
// never answered". The readiness failure now ends with the furthest worker stage the control plane showed.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  furthestReadinessWorkerStage,
  readinessWorkerStage,
  type ReadinessWorkerStage,
} from '../lib/ai/cos/cosUniversityMassEvaluationReadiness.ts'
import { isEvaluatorInfrastructureFailure } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'

const SOURCE = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
const readiness = SOURCE.slice(
  SOURCE.indexOf('async function waitReady(endpointId:string,deadlineMs:number)'),
  SOURCE.indexOf('\nfunction batchPrompt'),
)

test('one health read maps to exactly one stage', () => {
  assert.equal(readinessWorkerStage(null), 'unknown')
  assert.equal(readinessWorkerStage({ ready: 0, running: 0, idle: 0, initializing: 0 }), 'cold')
  assert.equal(readinessWorkerStage({}), 'cold')
  assert.equal(readinessWorkerStage({ initializing: 1 }), 'initializing')
  assert.equal(readinessWorkerStage({ running: 1 }), 'warm')
  assert.equal(readinessWorkerStage({ ready: 1 }), 'warm')
  assert.equal(readinessWorkerStage({ idle: 1, initializing: 1 }), 'warm')
  assert.equal(readinessWorkerStage({ running: 'x', initializing: -2 }), 'cold')
})

test('the window keeps the furthest stage it saw', () => {
  const walk = (stages: ReadinessWorkerStage[]) => stages.reduce(furthestReadinessWorkerStage, 'unknown' as ReadinessWorkerStage)
  assert.equal(walk([]), 'unknown')
  assert.equal(walk(['cold', 'cold', 'cold']), 'cold')
  assert.equal(walk(['cold', 'initializing', 'cold']), 'initializing')
  assert.equal(walk(['cold', 'initializing', 'warm', 'cold']), 'warm')
  assert.equal(walk(['warm', 'unknown']), 'warm')
})

test('waitReady folds every successful health read into the stage and names it on timeout', () => {
  assert.match(readiness, /let workerStage:ReadinessWorkerStage='unknown'/)
  assert.match(readiness, /if\(health\.ok\)workerStage=furthestReadinessWorkerStage\(workerStage,readinessWorkerStage\(health\.workers\)\)/)
  assert.match(readiness, /throw new Error\(`mass_distilled_evaluation_runtime_not_ready:\$\{lastError\|\|status\|\|'network'\}:workers=\$\{workerStage\}`\)/)
  // No extra provider calls: still one health read and one /ping per poll.
  assert.equal(readiness.match(/massDistilledRuntimeHealth\(/g)?.length, 1)
  assert.equal(readiness.match(/\/ping`/g)?.length, 1)
})

test('every stage-suffixed readiness failure stays infrastructure, never a student attempt', () => {
  for (const stage of ['unknown', 'cold', 'initializing', 'warm'] as const) {
    for (const cause of ['mass_distilled_gateway_ping_timeout', 'mass_distilled_gateway_ping_http_503', 'network']) {
      const error = `mass_distilled_evaluation_runtime_not_ready:${cause}:workers=${stage}`
      assert.equal(isEvaluatorInfrastructureFailure(error), true, error)
    }
  }
})
const ROUTE = readFileSync(new URL('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts', import.meta.url), 'utf8')

test('a successful readiness wait returns the whole seconds it took', () => {
  assert.match(readiness, /async function waitReady\(endpointId:string,deadlineMs:number\):Promise<number>\{/)
  assert.match(readiness, /const waitStartedAt=Date\.now\(\)/)
  assert.match(readiness, /if\(response\.status===200\)\{[\s\S]*?return Math\.round\(\(Date\.now\(\)-waitStartedAt\)\/1000\)/)
  // The timeout path is unchanged: it still throws the stage-suffixed infrastructure failure.
  assert.equal(readiness.match(/throw new Error\(`mass_distilled_evaluation_runtime_not_ready:/g)?.length, 1)
})

test('only the exam cold start is measured and the completed result carries it', () => {
  assert.equal(SOURCE.match(/const readinessSeconds=await waitReady\(input\.claim\.endpointId,input\.deadlineMs\)/g)?.length, 1)
  assert.match(SOURCE, /productionTrafficAuthorized:false,endpointCalls:budget\.used,judgeCalls:JUDGE_CALLS,readinessSeconds\}\)/)
})

test('the route writes readinessSeconds on the COMPLETED event', () => {
  const start = ROUTE.indexOf('eventClaim: COMPLETED,')
  const completed = ROUTE.slice(start, ROUTE.indexOf('await recordProduction(true, {', start))
  assert.ok(start > 0 && completed.length > 0)
  assert.match(completed, /readinessSeconds: result\.readinessSeconds,/)
})
// end of saas/tests/massEvaluationReadinessWorkerStage.node.test.ts (if this line is missing, the paste was cut short)
