import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const source = fs.readFileSync(path.join(process.cwd(), 'lib/builder/agent-v2.ts'), 'utf8')
const cycle = fs.readFileSync(path.join(process.cwd(), 'lib/builder/agent-v2-job-cycle.ts'), 'utf8')

test('per-slice Harness budget rejection checkpoints for governed continuation, rather than terminating the whole job', () => {
  const guard = source.indexOf("if (error instanceof Error && error.message === 'harness_provider_cost_budget_exceeded')")
  const outage = source.indexOf("return { ok: false, reason: 'builder_v2_model_unavailable'", guard)
  assert.ok(guard > 0)
  assert.ok(outage > guard)
  const guarded = source.slice(guard, outage + 250)
  assert.match(guarded, /reason: 'builder_v2_model_unavailable'/)
  assert.match(guarded, /summary: 'harness_provider_cost_budget_exceeded'/)
  assert.match(guarded, /checkpoint: await snapshot\(\)/)
  assert.match(cycle, /result\.summary === 'harness_provider_cost_budget_exceeded'/)
})

test('budget exhaustion never causes an in-slice inference retry', () => {
  assert.match(source, /error\.message === 'harness_provider_cost_budget_exceeded'\)\)\) throw error/)
})
