import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  SECONDARY_REFERENCE_DIAGNOSTIC_AGENT_ID,
  diagnoseSecondaryReferenceIncident,
  secondaryReferenceDiagnosticArtifactText,
} from '../a2a-host/reference-secondary-diagnostic.ts'
import {
  createSpecialistMeshAcceptanceFailureToken,
  isValidSpecialistMeshAcceptanceFailureToken,
} from '../a2a-host/specialist-mesh-acceptance-control.ts'

const TEST_SECRET = 'test-only-specialist-mesh-control-secret-32-bytes'

test('secondary Production reference specialist independently implements the advisory capability', () => {
  const result = diagnoseSecondaryReferenceIncident('Production requests return 504 gateway timeout after upstream latency increased.')
  assert.equal(result.classification, 'upstream_timeout_or_network')
  assert.ok(result.confidence >= 0.5)
  assert.ok(result.recommendedNextChecks.length >= 2)

  const artifact = JSON.parse(secondaryReferenceDiagnosticArtifactText('504 gateway timeout from the upstream dependency'))
  assert.equal(artifact.specialist, SECONDARY_REFERENCE_DIAGNOSTIC_AGENT_ID)
  assert.equal(artifact.skill, 'self-healing.diagnose')
  assert.equal(artifact.advisoryOnly, true)
})

test('controlled unavailability requires an exact short-lived server signature', () => {
  const now = new Date('2026-09-13T01:00:00.000Z')
  const agentId = 'worker-a'
  const token = createSpecialistMeshAcceptanceFailureToken({
    agentId,
    signingSecret: TEST_SECRET,
    now,
    ttlMs: 60_000,
    nonce: 'fixed-nonce',
  })
  assert.equal(isValidSpecialistMeshAcceptanceFailureToken({ token, agentId, signingSecret: TEST_SECRET, now }), true)
  assert.equal(isValidSpecialistMeshAcceptanceFailureToken({ token, agentId: 'worker-b', signingSecret: TEST_SECRET, now }), false)
  assert.equal(isValidSpecialistMeshAcceptanceFailureToken({ token, agentId, signingSecret: 'different-test-secret-32-bytes-long', now }), false)
  assert.equal(isValidSpecialistMeshAcceptanceFailureToken({ token, agentId, signingSecret: TEST_SECRET, now: new Date(now.getTime() + 61_000) }), false)
  assert.equal(isValidSpecialistMeshAcceptanceFailureToken({ token: 'unsigned', agentId, signingSecret: TEST_SECRET, now }), false)
})

test('Production acceptance is exact-scope, advisory-only, durable, deployment-bound, and caller cannot supply evidence', async () => {
  const runner = await readFile(new URL('../a2a-host/specialist-mesh-production-live-acceptance.ts', import.meta.url), 'utf8')
  const cron = await readFile(new URL('../app/api/cron/specialist-mesh-production-acceptance/route.ts', import.meta.url), 'utf8')

  assert.match(runner, /allowedSkills: \[\{ skillId: SKILL_ID, risk: 'advisory' as const \}\]/)
  assert.match(runner, /persistSupabaseSpecialistQualificationAssessment/)
  assert.match(runner, /a2a_specialist_mesh_telemetry/)
  assert.match(runner, /createSupervisorCoordinationStore/)
  assert.match(runner, /controlledRecoverableUnavailability: true/)
  assert.match(runner, /staleFirstOwnerRejected: true/)
  assert.match(runner, /authorityWidened: false/)
  assert.match(runner, /automaticWriteReplayEnabled: false/)
  assert.doesNotMatch(cron, /req\.json\(/)
  assert.doesNotMatch(cron, /searchParams/)
  assert.match(cron, /VERCEL_ENV !== 'production'/)
  assert.match(cron, /authorization.*Bearer/)
  assert.match(cron, /VERCEL_GIT_COMMIT_SHA/)
  assert.match(cron, /VERCEL_URL/)
  assert.match(cron, /createHash\('sha256'\)/)
  assert.match(cron, /specialist_mesh_live_acceptance_deployment_bound/)
  assert.match(cron, /contains\('payload', \{ productionCommit, productionDeploymentFingerprint \}\)/)
  assert.match(cron, /productionDeploymentFingerprint,/)

  const commitRead = cron.indexOf('const productionCommit =')
  const evidenceLookup = cron.indexOf(".eq('event_type', SPECIALIST_MESH_PRODUCTION_DEPLOYMENT_BINDING_EVENT)")
  assert.ok(commitRead >= 0 && evidenceLookup > commitRead, 'current Production commit must be read before acceptance evidence lookup')
})
