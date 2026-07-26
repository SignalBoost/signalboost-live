import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceCatalog } from '../agent-gateway/cluster-runtime-health-governance-catalog.ts'
import type { ClusterRuntimeHealthGovernanceArchive } from '../agent-gateway/cluster-runtime-health-governance-archive.ts'

const generatedAt = '2026-07-26T03:00:00.000Z'
const safety = Object.freeze({
  readOnly: true as const,
  advisoryOnly: true as const,
  automaticRetryEnabled: false as const,
  automaticRepairEnabled: false as const,
  infrastructureMutationEnabled: false as const,
})
const firstItem = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-archive-item-v1' as const,
  artifactId: 'gateway-east:artifact',
  kind: 'dashboard' as const,
  schema: 'agent-gateway-cluster-runtime-health-dashboard-v1',
  generatedAt,
  integrityDigest: '1234abcd',
  provenance: Object.freeze(['agent-gateway-runtime-health']),
  retentionClass: 'governance-evidence' as const,
  readOnly: true as const,
  executable: false as const,
})
const duplicateItem = Object.freeze({ ...firstItem })
const archive = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-archive-v1' as const,
  archiveId: 'gateway-east:archive',
  clusterId: 'gateway-east',
  generatedAt,
  snapshotId: 'gateway-east:snapshot',
  snapshotIntegrityDigest: '89abcdef',
  itemCount: 2,
  items: Object.freeze([firstItem, duplicateItem]),
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'fedcba98', canonical: true as const, appendOnlyCompatible: true as const }),
  retentionClass: 'governance-evidence' as const,
  safety,
  executable: false as const,
}) satisfies ClusterRuntimeHealthGovernanceArchive

test('creates deterministic immutable governance catalogs with duplicate suppression and statistics', () => {
  const first = createClusterRuntimeHealthGovernanceCatalog(archive)
  const second = createClusterRuntimeHealthGovernanceCatalog(archive)
  assert.deepEqual(first, second)
  assert.equal(first.entryCount, 2)
  assert.equal(first.archiveId, archive.archiveId)
  assert.equal(first.snapshotId, archive.snapshotId)
  assert.equal(first.statistics.dashboard, 1)
  assert.equal(first.statistics['governance-archive'], 1)
  assert.deepEqual(first.entries.map(entry => entry.kind), ['dashboard', 'governance-archive'])
  assert.match(first.integrity.digest, /^[0-9a-f]{8}$/)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.entries), true)
  assert.equal(Object.isFrozen(first.statistics), true)
  assert.equal(first.executable, false)
})

test('fails closed for malformed, unsafe, mismatched, and invalid archive inputs', () => {
  assert.throws(() => createClusterRuntimeHealthGovernanceCatalog({ ...archive, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthGovernanceArchive), /invalid/)
  assert.throws(() => createClusterRuntimeHealthGovernanceCatalog({ ...archive, safety: { ...safety, infrastructureMutationEnabled: true } } as unknown as ClusterRuntimeHealthGovernanceArchive), /unsafe/)
  assert.throws(() => createClusterRuntimeHealthGovernanceCatalog({ ...archive, itemCount: 1 } as ClusterRuntimeHealthGovernanceArchive), /count/)
  assert.throws(() => createClusterRuntimeHealthGovernanceCatalog({ ...archive, generatedAt: 'invalid' } as ClusterRuntimeHealthGovernanceArchive), /identity/)
  const mismatchedItem = { ...firstItem, generatedAt: '2026-07-26T03:01:00.000Z' }
  assert.throws(() => createClusterRuntimeHealthGovernanceCatalog({ ...archive, items: [mismatchedItem, duplicateItem] } as unknown as ClusterRuntimeHealthGovernanceArchive), /entry/)
  assert.throws(() => createClusterRuntimeHealthGovernanceCatalog({ ...archive, integrity: { ...archive.integrity, digest: 'invalid' } } as unknown as ClusterRuntimeHealthGovernanceArchive), /integrity/)
})
