import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGuardianSelfHealingHandoff, guardianReviewRequest } from '../lib/security/github-guardian-self-healing.ts'

const observation = {
  observed_at: '2026-09-11T12:20:00.000Z',
  resource_id: 'signalboost/signalboost-live',
  correlation_id: 'github-webhook:delivery-1',
  safe_metadata: {
    sensitivePaths: ['saas/app/api/webhook/github/route.ts'],
    evidenceEntryHash: 'a'.repeat(64),
  },
}

test('benign repository observations do not fabricate Self-Healing incidents', () => {
  assert.equal(createGuardianSelfHealingHandoff({
    deliveryId: 'delivery-1', workItemId: 'work-1', organizationId: '271401395', observation, alert: null,
  }), null)
})

test('security-sensitive changes become review-gated Supervisor incidents without repair authority', () => {
  const handoff = createGuardianSelfHealingHandoff({
    deliveryId: 'delivery-1',
    workItemId: 'work-1',
    organizationId: '271401395',
    observation,
    alert: { repo: 'signalboost/signalboost-live', severity: 'medium' },
  })
  assert.ok(handoff)
  assert.equal(handoff.incident.metadata.observationOnly, true)
  assert.equal(handoff.incident.metadata.automaticRepairAuthorized, false)
  assert.equal(handoff.plan.riskLevel, 'medium')
  assert.equal(handoff.policy.outcome, 'approval_required')
  assert.deepEqual(handoff.policy.approvedStepIds, [])
  const review = guardianReviewRequest({ alertId: '4c9130e8-4049-42fd-8f37-c251927c0180', handoff })
  assert.equal(review.source_type, 'guardian_repository_change')
  assert.equal(review.id, '4c9130e8-4049-42fd-8f37-c251927c0180')
  assert.equal(review.status, 'awaiting_human_review')
  assert.equal(review.fix_plan_status, 'review_only')
  assert.equal((review.fix_plan as any).automaticRepairAuthorized, false)
})

test('Production worker durably records the policy handoff before completing work', () => {
  const route = readFileSync(new URL('../app/api/cron/github-observation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /createGuardianSelfHealingHandoff/)
  assert.match(route, /guardian-self-healing-\$\{deliveryId\}-received/)
  assert.match(route, /guardian-self-healing-\$\{deliveryId\}-policy/)
  assert.match(route, /automaticRepairAuthorized: false/)
  assert.match(route, /guardian_self_healing_handoff_failed/)
  assert.match(route, /guardian_review_persist_failed/)
  assert.match(route, /onConflict: 'id', ignoreDuplicates: true/)
  assert.match(route, /upsert\(\{ \.\.\.materialized\.alert, id: alertId \}/)
})

test('owner review disposition cannot be converted into repair approval', () => {
  const route = readFileSync(new URL('../app/api/hub/cyber/dependencies/route.ts', import.meta.url), 'utf8')
  const approveRoute = readFileSync(new URL('../app/api/hub/cyber/approve-and-prepare/route.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/dashboard/cybersecurity/page.tsx', import.meta.url), 'utf8')
  assert.match(route, /source_type === 'guardian_repository_change'/)
  assert.match(route, /guardian_review_does_not_authorize_repair/)
  assert.match(route, /review_disposition_recorded/)
  assert.match(route, /if \(alertUpdate\.error\)/)
  assert.match(approveRoute, /source\.data\.source_type === 'guardian_repository_change'/)
  assert.match(approveRoute, /guardian_review_does_not_authorize_repair/)
  assert.match(page, /reviewOnly = r\.source_type === 'guardian_repository_change'/)
  assert.match(page, /onDisposition\('completed', 'expected'\)/)
  assert.match(page, /guardianFinding\.sensitivePaths/)
  assert.match(page, /Could not record review disposition/)
  assert.match(page, /reviewOnly && r\.status === 'in_progress'/)
  assert.match(route, /disposition_retry_required/)
  assert.match(route, /retryable: !restored\.error/)
})
