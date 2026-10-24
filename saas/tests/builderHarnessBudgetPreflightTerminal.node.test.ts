import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const source = fs.readFileSync(path.join(process.cwd(), 'lib/builder/agent-v2.ts'), 'utf8')
const cycle = fs.readFileSync(path.join(process.cwd(), 'lib/builder/agent-v2-job-cycle.ts'), 'utf8')

test('Harness provider budget preflight is terminal and never converted to a retryable provider outage', () => {
  const guard = source.indexOf("error.message === 'harness_provider_cost_budget_exceeded'")
  const unavailable = source.indexOf("reason: 'builder_v2_model_unavailable'", guard)
  assert.ok(guard > 0, 'explicit budget guard must exist')
  assert.ok(unavailable > guard, 'budget guard must precede generic retryable outage')
  assert.match(source.slice(guard, unavailable), /reason: 'harness_provider_cost_budget_exceeded'/)
  assert.match(source.slice(guard, unavailable), /checkpoint: await snapshot\(\)/)
  assert.match(cycle, /reason === 'builder_v2_model_unavailable' \|\| recoverableEarlyStop/)
})

test('in-slice model retries also stop immediately on provider preflight rejection', () => {
  assert.match(source, /error\.message === 'harness_provider_cost_budget_exceeded'\)\)\) throw error/)
})
