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
    ref: 'refs/heads/main',
    commitSha: 'b'.repeat(40),
  },
}

test('benign repository observations do not fabricate Self-Healing incidents', () => {
  assert.equal(createGuardianSelfHealingHandoff({
    deliveryId: 'delivery-1', workItemId: 'work-1', organizationId: '271401395', observation, alert: null,
  }), null)
})

test('routine security-sensitive observations are classified autonomously without repair authority', () => {
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
  assert.equal(handoff.incident.metadata.reviewRequired, false)
  assert.equal(handoff.plan.riskLevel, 'low')
  assert.equal(handoff.policy.outcome, 'approved')
  assert.deepEqual(handoff.policy.approvedStepIds, ['classify-repository-observation'])
  const review = guardianReviewRequest({ alertId: '4c9130e8-4049-42fd-8f37-c251927c0180', handoff })
  assert.equal(review.source_type, 'guardian_repository_change')
  assert.equal(review.id, '4c9130e8-4049-42fd-8f37-c251927c0180')
  assert.equal(review.status, 'awaiting_human_review')
  assert.equal(review.fix_plan_status, 'review_only')
  assert.equal((review.fix_plan as any).automaticRepairAuthorized, false)
  assert.equal((review.findings as any[])[0].ref, 'refs/heads/main')
  assert.equal((review.findings as any[])[0].commitSha, 'b'.repeat(40))
})

test('Production worker durably records the policy handoff before completing work', () => {
  const route = readFileSync(new URL('../app/api/cron/github-observation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /createGuardianSelfHealingHandoff/)
  assert.match(route, /guardian-self-healing-\$\{deliveryId\}-received/)
  assert.match(route, /guardian-self-healing-\$\{deliveryId\}-policy/)
  assert.match(route, /automaticRepairAuthorized: false/)
  assert.match(route, /guardian_self_healing_handoff_failed/)
  assert.match(route, /guardian_review_persist_failed/)
  assert.match(route, /remediateNativeIncidents\(\[selfHealing\.incident\]/)
  assert.match(route, /automaticRepairAllowed: false/)
  assert.match(route, /guardian_supervisor_result_persist_failed/)
  assert.match(route, /supervisorOutcome: supervisorResult\.outcome/)
  assert.match(route, /record_guardian_repository_review_observation/)
  assert.match(route, /selfHealing\.policy\.outcome === 'approval_required'/)
  assert.match(route, /disposition: reviewRequestId \? 'human_review' : 'expected_activity'/)
  assert.match(route, /guardian-repository-change:/)
  const groupingMigration = readFileSync(new URL('../supabase/migrations/20260911160707_guardian_review_grouping.sql', import.meta.url), 'utf8')
  assert.match(groupingMigration, /pg_advisory_xact_lock/)
  assert.match(groupingMigration, /status in \('awaiting_human_review', 'in_progress'\)/)
  assert.match(groupingMigration, /limit 100/)
  assert.match(groupingMigration, /grant execute .* service_role/)
  // Retry identity remains durable after an evidence summary leaves the bounded 100-item review window.
  const retryMigration = readFileSync(new URL('../supabase/migrations/20260911163127_guardian_review_evidence_dedupe.sql', import.meta.url), 'utf8')
  assert.match(retryMigration, /guardian_repository_review_evidence/)
  assert.match(retryMigration, /where finding_id = p_finding->>'id'/)
  assert.match(retryMigration, /jsonb_build_array\(p_finding\) \|\| coalesce/)
  assert.match(retryMigration, /limit 100/)
  const backfillMigration = readFileSync(new URL('../supabase/migrations/20260911164011_guardian_review_evidence_backfill.sql', import.meta.url), 'utf8')
  assert.match(backfillMigration, /cross join lateral/)
  assert.match(backfillMigration, /event\.event_type = 'policy_evaluated'/)
  assert.match(backfillMigration, /on conflict \(finding_id\) do nothing/)
})

test('owner review disposition cannot be converted into repair approval', () => {
  const route = readFileSync(new URL('../app/api/hub/cyber/dependencies/route.ts', import.meta.url), 'utf8')
  const approveRoute = readFileSync(new URL('../app/api/hub/cyber/approve-and-prepare/route.ts', import.meta.url), 'utf8')
  const page = readFileSync(new URL('../app/dashboard/cybersecurity/page.tsx', import.meta.url), 'utf8')
  assert.match(route, /source_type === 'guardian_repository_change'/)
  assert.match(route, /guardian_review_does_not_authorize_repair/)
  assert.match(approveRoute, /source\.data\.source_type === 'guardian_repository_change'/)
  assert.match(approveRoute, /guardian_review_does_not_authorize_repair/)
  assert.match(page, /reviewOnly = r\.source_type === 'guardian_repository_change'/)
  assert.match(page, /onDisposition\('completed', 'expected'\)/)
  assert.match(page, /guardianFinding\.sensitivePaths/)
  assert.match(page, /Could not record review disposition/)
  assert.match(page, /reviewOnly && r\.status === 'in_progress'/)
  assert.match(route, /record_guardian_review_disposition/)
  const migration = readFileSync(new URL('../supabase/migrations/20260911152745_guardian_review_atomic_disposition.sql', import.meta.url), 'utf8')
  assert.match(migration, /for update/)
  assert.match(migration, /guardian_linked_alert_not_found/)
  assert.match(migration, /grant execute .* service_role/)
})
