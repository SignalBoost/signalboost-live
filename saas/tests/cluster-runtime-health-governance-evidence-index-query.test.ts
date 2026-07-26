import assert from 'node:assert/strict'
import test from 'node:test'

import { queryClusterRuntimeHealthGovernanceEvidenceIndex } from '../agent-gateway/cluster-runtime-health-governance-evidence-index-query.ts'
import type { ClusterRuntimeHealthGovernanceEvidenceIndex } from '../agent-gateway/cluster-runtime-health-governance-evidence-index.ts'

const generatedAt = '2026-07-26T06:55:00.000Z'
const safety = Object.freeze({
  readOnly: true as const,
  advisoryOnly: true as const,
  automaticRetryEnabled: false as const,
  automaticRepairEnabled: false as const,
  infrastructureMutationEnabled: false as const,
})
const entries = Object.freeze([
  Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1' as const, artifactId: 'a-dashboard', kind: 'dashboard' as const, schema: 'dashboard-v1', generatedAt, integrityDigest: '11111111', provenance: Object.freeze(['runtime-health', 'bundle-1']), retentionClass: 'governance-evidence' as const, readOnly: true as const, executable: false as const }),
  Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1' as const, artifactId: 'b-manifest', kind: 'evidence-manifest' as const, schema: 'manifest-v1', generatedAt, integrityDigest: '22222222', provenance: Object.freeze(['runtime-health', 'bundle-1']), retentionClass: 'governance-evidence' as const, readOnly: true as const, executable: false as const }),
  Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1' as const, artifactId: 'c-bundle', kind: 'governance-evidence-bundle' as const, schema: 'bundle-v1', generatedAt, integrityDigest: '33333333', provenance: Object.freeze(['runtime-health']), retentionClass: 'governance-evidence' as const, readOnly: true as const, executable: false as const }),
])
const index = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-v1' as const,
  indexId: 'gateway-east:index', clusterId: 'gateway-east', generatedAt,
  bundleId: 'bundle-1', manifestId: 'manifest-1', registryId: 'registry-1', catalogId: 'catalog-1', archiveId: 'archive-1', snapshotId: 'snapshot-1',
  entryCount: entries.length, entries,
  statistics: Object.freeze({ dashboard: 1, 'evidence-manifest': 1, 'governance-evidence-bundle': 1 }),
  schemaInventory: Object.freeze({ 'dashboard-v1': 1, 'manifest-v1': 1, 'bundle-v1': 1 }),
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'abcdef12', canonical: true as const, appendOnlyCompatible: true as const }),
  retentionClass: 'governance-evidence' as const, safety, executable: false as const,
}) satisfies ClusterRuntimeHealthGovernanceEvidenceIndex

test('returns deterministic immutable filtered and paginated evidence queries', () => {
  const first = queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { provenance: ['bundle-1'], limit: 1 })
  const second = queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { provenance: ['bundle-1'], limit: 1 })
  assert.deepEqual(first, second)
  assert.equal(first.matchedCount, 2)
  assert.equal(first.returnedCount, 1)
  assert.equal(first.entries[0]?.artifactId, 'a-dashboard')
  assert.equal(first.nextCursor, 'abcdef12:1')
  const pageTwo = queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { provenance: ['bundle-1'], limit: 1, cursor: first.nextCursor ?? undefined })
  assert.equal(pageTwo.entries[0]?.artifactId, 'b-manifest')
  assert.equal(pageTwo.nextCursor, null)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.entries), true)
  assert.equal(Object.isFrozen(first.integrity), true)
  assert.equal(first.executable, false)
})

test('supports exact artifact, kind, and schema filters', () => {
  assert.deepEqual(queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { artifactIds: ['c-bundle'] }).entries.map(entry => entry.artifactId), ['c-bundle'])
  assert.deepEqual(queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { kinds: ['dashboard'] }).entries.map(entry => entry.artifactId), ['a-dashboard'])
  assert.deepEqual(queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { schemas: ['manifest-v1'] }).entries.map(entry => entry.artifactId), ['b-manifest'])
})

test('fails closed for unsafe indexes and malformed filters, limits, and cursors', () => {
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex({ ...index, safety: { ...safety, automaticRepairEnabled: true } } as unknown as ClusterRuntimeHealthGovernanceEvidenceIndex), /unsafe/)
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex({ ...index, entryCount: 2 } as ClusterRuntimeHealthGovernanceEvidenceIndex), /count/)
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { artifactIds: [''] }), /artifactIds/)
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { limit: 0 }), /limit/)
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { limit: '1' } as unknown), /limit/)
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { cursor: 'wrong:1' }), /cursor/)
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { cursor: 'abcdef12:99' }), /range/)
})
