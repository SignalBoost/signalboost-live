import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')

// Policy since f6094f0: fresh workspaces default to V2 for owners and customers; an explicit v1 request opts out;
// an explicit v2 request against an existing workspace or project is refused, so V1 checkpoints never move engines.
test('fresh workspaces default to V2, v1 opts out, and V2 never takes over an existing workspace', () => {
  assert.match(route, /requestedEngine !== undefined && requestedEngine !== 'v1' && requestedEngine !== 'v2'/)
  assert.match(route, /if \(requestedEngine === 'v2' && \(requestedWorkspaceId \|\| project\.context\)\) \{\s+return noStore\(\{ error: 'builder_v2_requires_fresh_workspace' \}, \{ status: 409 \}\)/)
  assert.match(route, /\(requestedEngine === 'v2' \|\| \(requestedEngine !== 'v1' && !requestedWorkspaceId && !project\.context\)\) \? \{ builderEngine: 'v2' \}/)
  assert.doesNotMatch(route, /requestedEngine === 'v2' && !access\.isOwner/)
})

test('the runner keeps V1 for untagged jobs', () => {
  assert.match(runner, /job\.metadata\.builderEngine === 'v2'/)
  assert.match(runner, /runBuilderV2JobCycle/)
  assert.match(runner, /new BuilderToolLoop/)
})
