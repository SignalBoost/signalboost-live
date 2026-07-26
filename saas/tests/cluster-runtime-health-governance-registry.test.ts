import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceRegistry } from '../agent-gateway/cluster-runtime-health-governance-registry.ts'
import type { ClusterRuntimeHealthGovernanceCatalog } from '../agent-gateway/cluster-runtime-health-governance-catalog.ts'

const generatedAt = '2026-07-26T04:00:00.000Z'
const safety = Object.freeze({
  readOnly: true as const,
  advisoryOnly: true as const,
  automaticRetryEnabled: false as const,
  automaticRepairEnabled: false as const,
  infrastructureMutationEnabled: false as const,
})
const firstEntry = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-catalog-entry-v1' as const,
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
const duplicateEntry = Object.freeze({ ...firstEntry, provenance: Object.freeze(['agent-gateway-runtime-health', 'archive']) })
const catalog = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-catalog-v1' as const,
  catalogId: 'gateway-east:catalog',
  clusterId: 'gateway-east',
  generatedAt,
  archiveId: 'gateway-east:archive',
  snapshotId: 'gateway-east:snapshot',
  entryCount: 2,
  entries: Object.freeze([firstEntry, duplicateEntry]),
  statistics: Object.freeze({ dashboard: 2 }),
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'fedcba98', canonical: true as const, appendOnlyCompatible: true as const }),
  retentionClass: 'governance-evidence' as const,
  safety,
  executable: false as const,
}) satisfies ClusterRuntimeHealthGovernanceCatalog

test('creates identical immutable governance registries with canonical inventories', () => {
  const first = createClusterRuntimeHealthGovernanceRegistry(catalog)
  const second = createClusterRuntimeHealthGovernanceRegistry(catalog)
  assert.deepEqual(first, second)
  assert.equal(first.entryCount, 2)
  assert.equal(first.statistics.dashboard, 1)
  assert.equal(first.statistics['governance-catalog'], 1)
  assert.equal(first.schemaInventory['agent-gateway-cluster-runtime-health-dashboard-v1'], 1)
  assert.equal(first.catalogId, catalog.catalogId)
  assert.equal(first.archiveId, catalog.archiveId)
  assert.equal(first.snapshotId, catalog.snapshotId)
  assert.match(first.integrity.digest, /^[0-9a-f]{8}$/)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.entries), true)
  assert.equal(Object.isFrozen(first.statistics), true)
  assert.equal(Object.isFrozen(first.schemaInventory), true)
  assert.equal(first.executable, false)
})

test('fails closed for malformed, unsafe, mismatched, and inconsistent catalogs', () => {
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistry({ ...catalog, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthGovernanceCatalog), /invalid/)
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistry({ ...catalog, safety: { ...safety, infrastructureMutationEnabled: true } } as unknown as ClusterRuntimeHealthGovernanceCatalog), /unsafe/)
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistry({ ...catalog, entryCount: 1 } as ClusterRuntimeHealthGovernanceCatalog), /count/)
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistry({ ...catalog, generatedAt: 'bad-date' } as ClusterRuntimeHealthGovernanceCatalog), /identity/)
  const badEntry = { ...firstEntry, generatedAt: '2026-07-26T05:00:00.000Z' }
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistry({ ...catalog, entries: [badEntry, duplicateEntry] } as unknown as ClusterRuntimeHealthGovernanceCatalog), /entry/)
})
