import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/admin/cos-university-telemetry/route.ts', import.meta.url), 'utf8')

test('University telemetry keeps durable graduates visible outside the recent-artifact window', () => {
  assert.match(route, /graduateCandidateIds/)
  assert.match(route, /graduateArtifactsResult/)
  assert.match(route, /\.in\('candidate_id', graduateCandidateIds\)/)
  assert.match(route, /telemetryArtifactRows/)
  assert.match(route, /const artifacts = telemetryArtifactRows\.map/)
  assert.match(route, /candidate_id.*trained_artifact_hash/)
})
