// saas/tests/cosFreshGroundedTask.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')

test('a rejected strict fresh synthesis gets a reasoned, source-grounded task completion before any refusal', () => {
  const groundedAt = route.indexOf('const groundedTask=await runFreshGroundedTaskCompletion(lookupInput,language,freshSources)')
  const refusalAt = route.indexOf('const reason=freshHardFail?{code:freshFailureCode!')
  assert.ok(groundedAt > 0, 'grounded task completion must be wired into the fresh hard-fail path')
  assert.ok(groundedAt < refusalAt, 'grounded task completion must run before the fail-closed refusal')
  assert.match(route, /if\(freshHardFail&&freshRetrievedAt&&freshSources\.length&&!requestedAction\)/)
  assert.match(route, /source:'cos-fresh-grounded-task'/)
})

test('the model, not a word list, decides task vs bare fact, and unsupported specifics are marked unverified', () => {
  assert.match(route, /If the request is only to confirm one specific current fact[\s\S]*return \{"answer":"","confidence":0\}/)
  assert.match(route, /must be clearly marked as unverified/)
  assert.match(route, /Never invent free services, discounts, businesses, venues, routes or prices/)
})
