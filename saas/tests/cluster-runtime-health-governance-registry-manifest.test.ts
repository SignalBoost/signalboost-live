import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceRegistryManifest } from '../agent-gateway/cluster-runtime-health-governance-registry-manifest.ts'
import type { ClusterRuntimeHealthGovernanceRegistry } from '../agent-gateway/cluster-runtime-health-governance-registry.ts'

const generatedAt = '2026-07-26T04:30:00.000Z'
const safety = Object.freeze({
  readOnly: true as const,
  advisoryOnly: true as const,
  automaticRetryEnabled: false as const,
  automaticRepairEnabled: false as const,
  infrastructureMutationEnabled: false as const,
})
const entry = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-registry-entry-v1' as const,
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
const duplicate = Object.freeze({ ...entry, provenance: Object.freeze(['agent-gateway-runtime-health', 'registry']) })
const registry = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-registry-v1' as const,
  registryId: 'gateway-east:registry',
  clusterId: 'gateway-east',
  generatedAt,
  catalogId: 'gateway-east:catalog',
  archiveId: 'gateway-east:archive',
  snapshotId: 'gateway-east:snapshot',
  entryCount: 2,
  entries: Object.freeze([entry, duplicate]),
  statistics: Object.freeze({ dashboard: 2 }),
  schemaInventory: Object.freeze({ 'agent-gateway-cluster-runtime-health-dashboard-v1': 2 }),
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'fedcba98', canonical: true as const, appendOnlyCompatible: true as const }),
  retentionClass: 'governance-evidence' as const,
  safety,
  executable: false as const,
}) satisfies ClusterRuntimeHealthGovernanceRegistry

test('creates identical immutable registry manifests with canonical inventories', () => {
  const first = createClusterRuntimeHealthGovernanceRegistryManifest(registry)
  const second = createClusterRuntimeHealthGovernanceRegistryManifest(registry)
  assert.deepEqual(first, second)
  assert.equal(first.entryCount, 2)
  assert.equal(first.statistics.dashboard, 1)
  assert.equal(first.statistics['governance-registry'], 1)
  assert.equal(first.schemaInventory['agent-gateway-cluster-runtime-health-dashboard-v1'], 1)
  assert.equal(first.registryId, registry.registryId)
  assert.equal(first.catalogId, registry.catalogId)
  assert.equal(first.archiveId, registry.archiveId)
  assert.equal(first.snapshotId, registry.snapshotId)
  assert.match(first.integrity.digest, /^[0-9a-f]{8}$/)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.entries), true)
  assert.equal(Object.isFrozen(first.statistics), true)
  assert.equal(Object.isFrozen(first.schemaInventory), true)
  assert.equal(first.executable, false)
})

test('fails closed for malformed, unsafe, mismatched, and inconsistent registries', () => {
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistryManifest({ ...registry, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthGovernanceRegistry), /invalid/)
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistryManifest({ ...registry, safety: { ...safety, infrastructureMutationEnabled: true } } as unknown as ClusterRuntimeHealthGovernanceRegistry), /unsafe/)
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistryManifest({ ...registry, entryCount: 1 } as ClusterRuntimeHealthGovernanceRegistry), /count/)
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistryManifest({ ...registry, generatedAt: 'bad-date' } as ClusterRuntimeHealthGovernanceRegistry), /identity/)
  const badEntry = { ...entry, generatedAt: '2026-07-26T05:00:00.000Z' }
  assert.throws(() => createClusterRuntimeHealthGovernanceRegistryManifest({ ...registry, entries: [badEntry, duplicate] } as unknown as ClusterRuntimeHealthGovernanceRegistry), /entry/)
})
