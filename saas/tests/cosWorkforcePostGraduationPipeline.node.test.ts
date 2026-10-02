// saas/tests/cosWorkforcePostGraduationPipeline.node.test.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261002030000_workforce_post_graduation_pipeline.sql')
const evidence = read('lib/ai/cos/graduateServingAttempts.ts')
const recovery = read('app/api/cron/cos-workforce-pipeline/route.ts')
const vercel = read('vercel.json')

test('post-graduation pipeline preserves permanent identity and follows real work evidence', () => {
  assert.match(migration, /permanent_artifact_id as ai_id/i)
  assert.match(migration, /cos_workforce_roster/)
  assert.match(migration, /cos_university_graduate_serving_attempts/)
  assert.match(migration, /cos_university_graduate_lifecycle_events/)
  assert.match(migration, /awaiting_dispatch/)
  assert.match(migration, /serving_unproven/)
  assert.match(migration, /served_awaiting_verification/)
  assert.match(migration, /working_verified/)
  assert.doesNotMatch(migration, /authority_expanded\s*=\s*true/i)
})

test('serving evidence enters a durable retry outbox instead of disappearing', () => {
  assert.match(migration, /cos_workforce_evidence_outbox/)
  assert.match(evidence, /enqueueGraduateServingEvidence/)
  assert.match(evidence, /drainGraduateServingEvidence/)
  assert.match(evidence, /attempts >= 12/)
  assert.match(evidence, /status: terminal \? 'blocked' : 'pending'/)
})

test('governed recovery watches stranded and repeatedly failing Workforce members', () => {
  assert.match(recovery, /idleHours >= 6/)
  assert.match(recovery, /failed_attempts/)
  assert.match(recovery, /fallback_attempts/)
  assert.match(recovery, /assistant_messages/)
  assert.match(recovery, /role', 'user'/)
  assert.match(recovery, /genuine_production_replay/)
  assert.match(recovery, /runWorkforceApprenticeShadow/)
  assert.match(recovery, /status', 'runtime_failed'/)
  assert.match(recovery, /count >= 2/)
  assert.match(recovery, /runtimeBlocked/)
  assert.match(recovery, /eligibleRecoveryTargets/)
  // Owner 2026-10-02: no paid wake-ups. Recovery never boots or waits for a graduate endpoint (#3588 reverted).
  assert.doesNotMatch(recovery, /proveGraduateServedIdentity|RUNTIME_READY_MAX_MS/)
  assert.match(recovery, /recoveryAttempts >= Math\.min\(3, eligibleRecoveryTargets\.length\)/)
  assert.match(recovery, /runWorkforceApprenticeShadow[\s\S]*runtimeBlocked/)
  assert.match(recovery, /runtimeBlockedWorkers/)
  assert.match(recovery, /authorityExpanded: false/)
  assert.match(vercel, /\/api\/cron\/cos-workforce-pipeline/)
})
// end of saas/tests/cosWorkforcePostGraduationPipeline.node.test.ts (if this line is missing, the paste was cut short)
