import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/admin/cos-university-telemetry/route.ts', import.meta.url), 'utf8')

test('durable graduates carry their historical exact evaluation into telemetry', () => {
  assert.match(route, /graduateEvaluationsResult/)
  assert.match(route, /\.from\(EVALUATIONS\)/)
  assert.match(route, /\.in\('candidate_id', graduateCandidateIds\)/)
  assert.match(route, /telemetryEvaluationRows/)
  assert.match(route, /for \(const row of telemetryEvaluationRows\)/)
  assert.match(route, /Date\.parse/)
})
