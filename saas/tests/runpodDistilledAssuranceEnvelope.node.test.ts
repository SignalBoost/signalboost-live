import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL('../app/api/cron/runpod-distilled-local-deploy/route.ts', import.meta.url), 'utf8')

function recordFunctionSource(): string {
  const start = route.indexOf('async function record(claim: string')
  const end = route.indexOf('\nfunction legacyQueueEndpointIds', start)
  assert.ok(start >= 0 && end > start, 'record() source boundary must exist')
  return route.slice(start, end)
}

test('distilled assurance persistence stores the complete host-owned envelope', () => {
  const source = recordFunctionSource()
  assert.match(source, /profile:\s*PROFILE/)
  assert.match(source, /claim,/)
  assert.match(source, /candidateId:\s*CANDIDATE_ID/)
  assert.match(source, /artifactHash:\s*ARTIFACT_HASH/)
  assert.match(source, /authorityExpanded:\s*false/)
  assert.match(source, /evidence:\s*body/)
})

test('distilled assurance persistence never drops the envelope and stores only the caller payload', () => {
  const source = recordFunctionSource()
  assert.doesNotMatch(source, /evidence_hash:\s*evidenceHash,\s*\n\s*evidence,\s*\n/)
})

test('canary discovery and retry ceilings still depend on persisted profile, claim and artifact identity', () => {
  assert.match(route, /row\?\.evidence\?\.profile === PROFILE/)
  assert.match(route, /row\?\.evidence\?\.claim === 'local_distilled_runtime_endpoint_provisioned'/)
  assert.match(route, /row\?\.evidence\?\.claim === 'local_distilled_runtime_canary_failed'/)
  assert.match(route, /row\?\.evidence\?\.artifactHash === ARTIFACT_HASH/)
  assert.match(route, /const consumedInvocations = Math\.max\(failures, starts\)/)
  assert.match(route, /consumedInvocations >= approvedMaxCanaryInvocations/)
})
