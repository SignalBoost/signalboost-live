import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateUniversityMassDistillationHealth } from '../self-healing-host/university-distillation-monitoring.ts'

const now = new Date('2026-09-16T22:30:00.000Z')
const receipt = {
  observed_at: '2026-09-16T22:29:30.000Z',
  commit_sha: 'uncapped-proof',
  evidence: { invocationSucceeded: true },
}

test('uncapped rolling policy never becomes budget_paused when a prepared batch is ready', () => {
  const snapshot = evaluateUniversityMassDistillationHealth({
    now,
    expectedIntervalSeconds: 60,
    campaigns: [],
    receipt,
    workflowRuns: [],
    providerJobs: [],
    continuity: {
      preparedBatches: 4,
      rollingPolicyEnabled: true,
      rollingMaximumAuthorizedCostUsd: null,
      rollingAuthorizedCostUsd: 2500,
      nextBudgetReleaseAt: '2026-09-17T01:00:00.000Z',
    },
  })

  assert.equal(snapshot.state, 'repair_required')
  assert.deepEqual(snapshot.reasons, ['prepared_campaign_not_authorized'])
  assert.equal(snapshot.automaticRecoveryAuthorized, true)
  assert.equal(snapshot.rollingCeilingRemoved, true)
  assert.equal(snapshot.rollingMaximumAuthorizedCostUsd, null)
  assert.equal(snapshot.rollingRemainingAuthorizedCostUsd, null)
  assert.equal(snapshot.nextBudgetReleaseAt, null)
  assert.ok(!snapshot.reasons.includes('rolling_budget_exhausted'))
})

test('uncapped rolling policy waits only for curriculum when no prepared batch exists', () => {
  const snapshot = evaluateUniversityMassDistillationHealth({
    now,
    expectedIntervalSeconds: 60,
    campaigns: [],
    receipt,
    workflowRuns: [],
    providerJobs: [],
    continuity: {
      preparedBatches: 0,
      rollingPolicyEnabled: true,
      rollingMaximumAuthorizedCostUsd: null,
      rollingAuthorizedCostUsd: 2500,
      nextBudgetReleaseAt: '2026-09-17T01:00:00.000Z',
    },
  })

  assert.equal(snapshot.state, 'waiting_for_curriculum')
  assert.deepEqual(snapshot.reasons, ['curriculum_supply_waiting'])
  assert.equal(snapshot.rollingCeilingRemoved, true)
  assert.equal(snapshot.rollingRemainingAuthorizedCostUsd, null)
})
