import assert from 'node:assert/strict'
import test from 'node:test'
import type { OperationsIntelligenceSnapshot } from '../lib/enterprise/operations/operationsIntelligence.ts'
import { OperationsSnapshotRefresh } from '../lib/enterprise/operations/operationsSnapshotRefresh.ts'

const intervalStartedAt = '2026-07-19T05:00:00.000Z'

function snapshot(organizationId: string): OperationsIntelligenceSnapshot {
  return {
    organizationId,
    generatedAt: intervalStartedAt,
    health: { score: 100, state: 'green' },
    incidents: { total: 0, open: 0, critical: 0, awaitingVerification: 0, awaitingClosureApproval: 0, resolved: 0 },
    verification: { completed: 0, verified: 0, failed: 0, inconclusive: 0, successRate: 0, averageConfidence: 0 },
    learning: { acceptedSamples: 0, ignoredOutcomes: 0, strategies: 0, averageRecommendationConfidence: 0 },
    playbooks: { total: 0, candidate: 0, recommended: 0, trusted: 0, deprecated: 0 },
    recentIncidentIds: [],
  }
}

test('refresh processes enabled organizations and reports metrics', async () => {
  const produced: string[] = []
  const refresh = new OperationsSnapshotRefresh(
    {
      async listOrganizations() {
        return [
          { organizationId: 'org-1', enabled: true },
          { organizationId: 'org-2', enabled: true },
          { organizationId: 'org-3', enabled: false },
        ]
      },
    },
    {
      async produce(input) {
        produced.push(input.organizationId)
        assert.equal(input.generatedAt, intervalStartedAt)
        return snapshot(input.organizationId)
      },
    },
  )

  const result = await refresh.run({ intervalStartedAt })
  assert.deepEqual(produced, ['org-1', 'org-2'])
  assert.equal(result.processed, 2)
  assert.equal(result.skipped, 1)
  assert.equal(result.failed, 0)
  assert.equal(result.snapshots.length, 2)
})

test('refresh is idempotent within the current interval', async () => {
  let calls = 0
  const refresh = new OperationsSnapshotRefresh(
    {
      async listOrganizations() {
        return [{ organizationId: 'org-1', enabled: true, lastRefreshedAt: intervalStartedAt }]
      },
    },
    {
      async produce() {
        calls += 1
        return snapshot('org-1')
      },
    },
  )

  const result = await refresh.run({ intervalStartedAt })
  assert.equal(calls, 0)
  assert.equal(result.processed, 0)
  assert.equal(result.skipped, 1)
})

test('refresh isolates failures and continues other organizations', async () => {
  const refresh = new OperationsSnapshotRefresh(
    {
      async listOrganizations() {
        return [
          { organizationId: 'org-1', enabled: true },
          { organizationId: 'org-2', enabled: true },
          { organizationId: 'org-3', enabled: true },
        ]
      },
    },
    {
      async produce(input) {
        if (input.organizationId === 'org-2') throw new Error('source unavailable')
        return snapshot(input.organizationId)
      },
    },
  )

  const result = await refresh.run({ intervalStartedAt })
  assert.equal(result.processed, 2)
  assert.equal(result.failed, 1)
  assert.deepEqual(result.snapshots.map(item => item.organizationId), ['org-1', 'org-3'])
  assert.deepEqual(result.failures, [{ organizationId: 'org-2', error: 'source unavailable' }])
})

test('refresh normalizes and deduplicates organization scope', async () => {
  const produced: string[] = []
  const refresh = new OperationsSnapshotRefresh(
    {
      async listOrganizations() {
        return [
          { organizationId: ' org-1 ', enabled: true },
          { organizationId: 'org-1', enabled: true },
          { organizationId: '   ', enabled: true },
        ]
      },
    },
    {
      async produce(input) {
        produced.push(input.organizationId)
        return snapshot(input.organizationId)
      },
    },
  )

  const result = await refresh.run({ intervalStartedAt })
  assert.deepEqual(produced, ['org-1'])
  assert.equal(result.processed, 1)
  assert.equal(result.skipped, 2)
})

test('refresh reports invalid organization refresh state without stopping the run', async () => {
  const refresh = new OperationsSnapshotRefresh(
    {
      async listOrganizations() {
        return [
          { organizationId: 'org-1', enabled: true, lastRefreshedAt: 'bad' },
          { organizationId: 'org-2', enabled: true },
        ]
      },
    },
    {
      async produce(input) {
        return snapshot(input.organizationId)
      },
    },
  )

  const result = await refresh.run({ intervalStartedAt })
  assert.equal(result.processed, 1)
  assert.equal(result.failed, 1)
  assert.equal(result.failures[0].organizationId, 'org-1')
  assert.match(result.failures[0].error, /lastRefreshedAt/)
})

test('refresh rejects an invalid interval before loading organizations', async () => {
  let listed = false
  const refresh = new OperationsSnapshotRefresh(
    {
      async listOrganizations() {
        listed = true
        return []
      },
    },
    {
      async produce() {
        return snapshot('org-1')
      },
    },
  )

  await assert.rejects(() => refresh.run({ intervalStartedAt: 'bad' }), /intervalStartedAt/)
  assert.equal(listed, false)
})
