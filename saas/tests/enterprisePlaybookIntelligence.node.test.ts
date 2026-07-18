import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEnterprisePlaybookRegistry,
  fingerprintRepairStrategy,
  retrieveEnterprisePlaybooks,
} from '../lib/enterprise/memory/playbookIntelligence.ts'
import type { OrganizationalRepairLearning, RepairStrategyLearning } from '../lib/enterprise/memory/organizationalLearning.ts'

function strategy(overrides: Partial<RepairStrategyLearning> = {}): RepairStrategyLearning {
  return {
    strategyKey: 'vercel:medium:deploy|browser|supervisor',
    systems: ['vercel'],
    verifiedAttempts: 1,
    successes: 1,
    failures: 0,
    successRate: 1,
    averageVerificationConfidence: 0.9,
    recommendationConfidence: 0.6,
    sampleIds: ['sample-1'],
    ...overrides,
  }
}

function learning(strategies: readonly RepairStrategyLearning[]): OrganizationalRepairLearning {
  return {
    organizationId: 'org-1',
    acceptedSamples: [],
    ignoredOutcomeCount: 0,
    strategies,
  }
}

test('playbook registry creates deterministic candidate from verified learning', () => {
  const registry = buildEnterprisePlaybookRegistry('org-1', 'deployment_failure', learning([strategy()]), [], {
    createdAt: '2026-07-18T12:00:00.000Z',
  })
  assert.equal(registry.current.length, 1)
  assert.equal(registry.current[0].status, 'candidate')
  assert.equal(registry.current[0].version, 1)
  assert.match(registry.current[0].strategyFingerprint, /^pb-[0-9a-f]{8}$/)
  assert.equal(registry.current[0].playbookId, `org-1:deployment_failure:${registry.current[0].strategyFingerprint}:v1`)
})

test('playbook promotion is based on measured thresholds', () => {
  const recommended = buildEnterprisePlaybookRegistry('org-1', 'deployment_failure', learning([
    strategy({ verifiedAttempts: 6, successes: 5, failures: 1, successRate: 0.833, recommendationConfidence: 0.7 }),
  ])).current[0]
  const trusted = buildEnterprisePlaybookRegistry('org-1', 'deployment_failure', learning([
    strategy({ verifiedAttempts: 20, successes: 20, failures: 0, successRate: 1, recommendationConfidence: 0.91 }),
  ])).current[0]
  assert.equal(recommended.status, 'recommended')
  assert.equal(trusted.status, 'trusted')
})

test('unreliable playbooks are deprecated after sufficient attempts', () => {
  const registry = buildEnterprisePlaybookRegistry('org-1', 'deployment_failure', learning([
    strategy({ verifiedAttempts: 8, successes: 3, failures: 5, successRate: 0.375, recommendationConfidence: 0.2 }),
  ]))
  assert.equal(registry.current[0].status, 'deprecated')
  assert.deepEqual(retrieveEnterprisePlaybooks(registry), [])
  assert.equal(retrieveEnterprisePlaybooks(registry, { includeDeprecated: true }).length, 1)
})

test('changed metrics create a new immutable version and unchanged metrics do not', () => {
  const first = buildEnterprisePlaybookRegistry('org-1', 'deployment_failure', learning([strategy()]), [], {
    createdAt: '2026-07-18T12:00:00.000Z',
  })
  const unchanged = buildEnterprisePlaybookRegistry('org-1', 'deployment_failure', learning([strategy()]), first.versions, {
    createdAt: '2026-07-18T13:00:00.000Z',
  })
  const changed = buildEnterprisePlaybookRegistry('org-1', 'deployment_failure', learning([
    strategy({ verifiedAttempts: 2, successes: 2, successRate: 1, recommendationConfidence: 0.72, sampleIds: ['sample-1', 'sample-2'] }),
  ]), unchanged.versions, { createdAt: '2026-07-18T14:00:00.000Z' })
  assert.equal(unchanged.versions.length, 1)
  assert.equal(changed.versions.length, 2)
  assert.equal(changed.current[0].version, 2)
  assert.equal(changed.versions[0].createdAt, '2026-07-18T12:00:00.000Z')
})

test('retrieval ranks status and confidence and can filter by system', () => {
  const registry = buildEnterprisePlaybookRegistry('org-1', 'incident', learning([
    strategy({ strategyKey: 'vercel', systems: ['vercel'], verifiedAttempts: 20, successes: 20, successRate: 1, recommendationConfidence: 0.8 }),
    strategy({ strategyKey: 'security', systems: ['security'], verifiedAttempts: 6, successes: 5, failures: 1, successRate: 0.833, recommendationConfidence: 0.9 }),
  ]))
  assert.equal(registry.current[0].status, 'trusted')
  assert.equal(retrieveEnterprisePlaybooks(registry, { systems: ['security'] })[0].systems[0], 'security')
  assert.equal(retrieveEnterprisePlaybooks(registry, { limit: 1 }).length, 1)
})

test('fingerprints are stable and strategy-specific', () => {
  assert.equal(fingerprintRepairStrategy('same'), fingerprintRepairStrategy('same'))
  assert.notEqual(fingerprintRepairStrategy('same'), fingerprintRepairStrategy('different'))
})

test('playbook registry enforces organization, timestamps, policies, and limits', () => {
  assert.throws(() => buildEnterprisePlaybookRegistry('', 'incident', learning([])), /organizationId/)
  assert.throws(() => buildEnterprisePlaybookRegistry('org-1', '', learning([])), /incidentClass/)
  assert.throws(() => buildEnterprisePlaybookRegistry('org-2', 'incident', learning([])), /mismatch/)
  assert.throws(() => buildEnterprisePlaybookRegistry('org-1', 'incident', learning([]), [], { createdAt: 'bad' }), /timestamp/)
  assert.throws(() => buildEnterprisePlaybookRegistry('org-1', 'incident', learning([]), [], { policy: { trustedSuccessRate: 2 } }), /success-rate/)
  const registry = buildEnterprisePlaybookRegistry('org-1', 'incident', learning([strategy()]))
  assert.throws(() => retrieveEnterprisePlaybooks(registry, { limit: 0 }), /limit/)
})
