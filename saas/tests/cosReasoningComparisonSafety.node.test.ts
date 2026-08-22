import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const workerSource = readFileSync(new URL('../lib/ai/cos/cosReasoningWorkers.ts', import.meta.url), 'utf8')
const runnerSource = readFileSync(new URL('../lib/ai/cos/capabilityBenchmarkRunner.ts', import.meta.url), 'utf8')
const routeSource = readFileSync(new URL('../app/api/admin/cos-reasoning-comparison/route.ts', import.meta.url), 'utf8')

test('controlled evaluation context overrides role before learned routing', () => {
  const routing = workerSource.slice(workerSource.indexOf('async function routingDecision'))
  const evaluationIndex = routing.indexOf('currentReasoningEvaluationContext()')
  const learnedIndex = routing.indexOf('learnedRoutingOverride')
  assert.ok(evaluationIndex >= 0)
  assert.ok(learnedIndex > evaluationIndex)
  assert.match(routing, /controlled_comparison:/)
})

test('benchmark comparator can suppress automatic outcome attachment', () => {
  assert.match(runnerSource, /attachOutcome\?: boolean/)
  assert.match(runnerSource, /options\?\.attachOutcome !== false/)
  assert.match(runnerSource, /withReasoningEvaluationContext/)
})

test('comparison endpoint is owner-only, bounded, and verifies local execution before learning', () => {
  assert.match(routeSource, /requireOwner\(\)/)
  assert.match(routeSource, /MAX_REASONING_COMPARISON_EVALUATIONS/)
  assert.match(routeSource, /attachOutcome:\s*false/)
  assert.match(routeSource, /Boolean\(outcome\.provenance\.localModelInvoked\)/)
  assert.match(routeSource, /!Boolean\(outcome\.provenance\.externalAiInvoked\)/)
  assert.match(routeSource, /verifiedOutcomeRecorded = await attachTurnOutcome/)
})

test('comparison endpoint never contains a scheduled or background runner', () => {
  assert.doesNotMatch(routeSource, /export async function (PUT|PATCH|DELETE)/)
  assert.doesNotMatch(routeSource, /cron/i)
  assert.match(routeSource, /This endpoint never runs automatically/)
})
