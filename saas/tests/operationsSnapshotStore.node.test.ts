import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseOperationsSnapshotStore, parseOperationsIntelligenceSnapshot } from '../lib/enterprise/operations/operationsSnapshotStore.ts'
import type { OperationsIntelligenceSnapshot } from '../lib/enterprise/operations/operationsIntelligence.ts'

const snapshot: OperationsIntelligenceSnapshot = {
  organizationId: 'org-1',
  generatedAt: '2026-07-18T13:00:00.000Z',
  health: { score: 92, state: 'green' },
  incidents: { total: 1, open: 0, critical: 0, awaitingVerification: 0, awaitingClosureApproval: 0, resolved: 1 },
  verification: { completed: 1, verified: 1, failed: 0, inconclusive: 0, successRate: 1, averageConfidence: 0.9 },
  learning: { acceptedSamples: 1, ignoredOutcomes: 0, strategies: 1, averageRecommendationConfidence: 0.8 },
  playbooks: { total: 1, candidate: 0, recommended: 0, trusted: 1, deprecated: 0 },
  recentIncidentIds: ['incident-1'],
}

test('snapshot parser rejects malformed persisted data', () => {
  assert.throws(() => parseOperationsIntelligenceSnapshot(null), /must be an object/)
  assert.throws(() => parseOperationsIntelligenceSnapshot({ ...snapshot, generatedAt: 'bad' }), /valid generatedAt/)
  assert.throws(() => parseOperationsIntelligenceSnapshot({ ...snapshot, health: { score: 10, state: 'unknown' } }), /health is invalid/)
})

test('snapshot writer normalizes and upserts by organization and generated timestamp', async () => {
  let row: Record<string, unknown> | undefined
  let options: Record<string, unknown> | undefined
  const client = {
    from(table: string) {
      assert.equal(table, 'enterprise_operations_snapshots')
      return {
        async upsert(value: Record<string, unknown>, config: Record<string, unknown>) {
          row = value
          options = config
          return { error: null }
        },
      }
    },
  } as unknown as SupabaseClient

  const store = new SupabaseOperationsSnapshotStore(client)
  const saved = await store.save({ ...snapshot, organizationId: ' org-1 ', generatedAt: '2026-07-18T13:00:00Z' })

  assert.equal(saved.organizationId, 'org-1')
  assert.equal(saved.generatedAt, '2026-07-18T13:00:00.000Z')
  assert.deepEqual(row, {
    organization_id: 'org-1',
    generated_at: '2026-07-18T13:00:00.000Z',
    snapshot: saved,
  })
  assert.deepEqual(options, { onConflict: 'organization_id,generated_at', ignoreDuplicates: false })
})

test('snapshot writer fails closed when persistence fails', async () => {
  const client = {
    from() {
      return {
        async upsert() {
          return { error: { message: 'database unavailable' } }
        },
      }
    },
  } as unknown as SupabaseClient

  await assert.rejects(
    () => new SupabaseOperationsSnapshotStore(client).save(snapshot),
    /Unable to save operations snapshot: database unavailable/,
  )
})
