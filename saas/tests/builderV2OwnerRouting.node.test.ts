import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')

test('V2 requires explicit owner opt-in and a fresh workspace', () => {
  assert.match(route, /requestedEngine === 'v2' && !access\.isOwner/)
  assert.match(route, /requestedEngine === 'v2' && \(requestedWorkspaceId \|\| project\.context\)/)
  assert.match(route, /builder_v2_requires_fresh_workspace/)
  assert.match(route, /requestedEngine === 'v2' \? \{ builderEngine: 'v2' \}/)
})

test('V2 runner is fenced by owner, job kind, and tagged metadata; default stays V1 during canary', () => {
  assert.match(runner, /job\.ownerAuthorized === true && job\.jobKind === 'standard'/)
  assert.match(runner, /job\.metadata\.builderEngine === 'v2'/)
  assert.match(runner, /runBuilderV2JobCycle/)
  assert.match(runner, /new BuilderToolLoop/)
})
