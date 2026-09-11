import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createGuardianSelfHealingHandoff } from '../lib/security/github-guardian-self-healing.ts'

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
})

test('Production worker durably records the policy handoff before completing work', () => {
  const route = readFileSync(new URL('../app/api/cron/github-observation/route.ts', import.meta.url), 'utf8')
  assert.match(route, /createGuardianSelfHealingHandoff/)
  assert.match(route, /guardian-self-healing-\$\{deliveryId\}-received/)
  assert.match(route, /guardian-self-healing-\$\{deliveryId\}-policy/)
  assert.match(route, /automaticRepairAuthorized: false/)
  assert.match(route, /guardian_self_healing_handoff_failed/)
})
