// saas/tests/cosUniversityMassCanaryRollingWindowComplete.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MASS_CANARY_APPROVAL_CLAIM,
  MASS_CANARY_PROFILE,
  MASS_CANARY_ROLLING_MAX_APPROVALS,
  decideMassCanaryRollingApproval,
  type CanaryArtifact,
  type CanaryEvent,
} from '../lib/ai/cos/cosUniversityMassCanaryRollingAuthority.ts'

// Production 2026-09-24: 5 canary invocations started between 21:46 and 22:40 UTC against the former cap of 3 per
// rolling hour. The route only loaded events for artifacts still queued, so invocations of artifacts that had
// already passed (and left evaluation_pending) vanished from the hourly count.

const route = readFileSync(new URL('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts', import.meta.url), 'utf8')
const now = new Date('2026-09-24T22:34:24.000Z')
const h = (n: number) => n.toString(16).padStart(64, '0')
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()

const queued: CanaryArtifact = { candidateId: 'mass:queued', subjectId: 'Mathematics', artifactHash: h(9), createdAt: '2026-09-14T00:00:00.000Z' }
const invocation = (candidateId: string, observedAt: string): CanaryEvent => ({
  candidateId,
  observedAt,
  expiresAt: null,
  verifier: 'host_controller',
  evidence: { profile: MASS_CANARY_PROFILE, claim: 'local_distilled_runtime_canary_invocation_started' },
})

test('invocations of artifacts no longer queued still consume the rolling hourly budget', () => {
  assert.equal(MASS_CANARY_ROLLING_MAX_APPROVALS, 12)
  const events = Array.from({ length: MASS_CANARY_ROLLING_MAX_APPROVALS }, (_, index) =>
    invocation(`mass:already-passed-${index + 1}`, minutesAgo(59 - index * 4)),
  )
  const decision = decideMassCanaryRollingApproval({ artifacts: [queued], events, now, enabled: true })
  assert.equal('artifact' in decision, false)
  assert.equal((decision as { reason: string }).reason, 'mass_canary_rolling_window_exhausted')
})

test('invocations older than the rolling hour do not block the next approval', () => {
  const events = [
    invocation('mass:already-passed-1', minutesAgo(61)),
    invocation('mass:already-passed-2', minutesAgo(75)),
    invocation('mass:already-passed-3', minutesAgo(90)),
  ]
  const decision = decideMassCanaryRollingApproval({ artifacts: [queued], events, now, enabled: true })
  assert.ok('artifact' in decision)
  assert.equal(decision.artifact.candidateId, 'mass:queued')
  assert.equal(decision.evidence.claim, MASS_CANARY_APPROVAL_CLAIM)
})

test('route reads window invocations for every candidate, bounded by time', () => {
  const reader = route.match(/async function readRollingWindowInvocations[\s\S]*?\n}\n/)?.[0]
  assert.ok(reader, 'readRollingWindowInvocations must exist')
  assert.doesNotMatch(reader, /\.in\('candidate_id'/)
  assert.match(reader, /\.eq\('verifier','host_controller'\)/)
  assert.match(reader, /claim:ROLLING_WINDOW_INVOCATION_CLAIM/)
  assert.match(reader, /\.gt\('observed_at',windowStart\)/)
  assert.match(reader, /MASS_CANARY_ROLLING_WINDOW_HOURS\*3600_000/)
  assert.match(route, /const ROLLING_WINDOW_INVOCATION_CLAIM = 'local_distilled_runtime_canary_invocation_started'/)
})

test('route merges only outside-candidate window rows into the decision input', () => {
  const merge = route.match(/for\(const row of await readRollingWindowInvocations\(db,now\)\)\{[\s\S]*?\n  \}/)?.[0]
  assert.ok(merge, 'window invocations must be merged before the decision')
  assert.match(merge, /eligibleCandidateIds\.has/)
  assert.match(merge, /eventRows\.push\(row\)/)
  assert.ok(route.indexOf('readRollingWindowInvocations(db,now)') < route.indexOf('decideMassCanaryRollingApproval({'))
})
