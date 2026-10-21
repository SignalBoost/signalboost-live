import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
test('V1 cannot be requested and standard Builder requests use V2', () => {
  assert.match(route, /requestedEngine !== undefined && requestedEngine !== 'v2'/)
  // PR #4719: V2 repairs existing workspaces; only explicit new projects require a fresh one.
  assert.doesNotMatch(route, /builder_v2_requires_fresh_workspace/)
  assert.match(route, /builderEngine: 'v2'/)
  assert.doesNotMatch(route, /requestedEngine !== 'v1'/)
})
test('worker refuses untagged and legacy requests before executing the old loop', () => {
  assert.match(runner, /job\.jobKind !== 'standard' \|\| job\.metadata\.builderEngine !== 'v2'/)
  assert.match(runner, /terminalFailure\(job, 'builder_v1_retired_use_v2'\)/)
  assert.match(runner, /runBuilderV2JobCycle/)
})
