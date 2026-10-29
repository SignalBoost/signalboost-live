import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('current-head repair retains customer objective and advances the canonical plan version', () => {
  const repair = readFileSync('lib/builder/repository-repair-job.ts', 'utf8')
  assert.match(repair, /const objective = input\.objective/)
  assert.match(repair, /repairExecutionObjective: executionObjective/)
  assert.match(repair, /if \(replan\) \{\s*await advanceBuilderRepairPlanVersion\(/)
  assert.match(repair, /expectedVersion: 1, nextVersion: 2/)
})
test('plan advance is optimistic, owner-scoped, and does not rewrite objective, budget, or grants', () => {
  const store = readFileSync('lib/builder/job-store.ts', 'utf8')
  const start = store.indexOf('export async function advanceBuilderRepairPlanVersion')
  const end = store.indexOf('export async function claimBuilderJob', start)
  assert.ok(start >= 0 && end > start)
  const advance = store.slice(start, end)
  assert.match(advance, /input\.nextVersion !== input\.expectedVersion \+ 1/)
  assert.match(advance, /\.update\(\{ plan_version: input\.nextVersion \}\)/)
  assert.match(advance, /\.eq\('id', input\.jobId\)/)
  assert.match(advance, /\.eq\('user_id', input\.userId\)/)
  assert.match(advance, /\.eq\('plan_version', input\.expectedVersion\)/)
  assert.match(advance, /\.eq\('status', 'queued'\)/)
  assert.doesNotMatch(advance, /\.update\(\{[^}]*objective/)
})
