import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceEvidenceBundle } from '../agent-gateway/cluster-runtime-health-governance-evidence-bundle.ts'
import type { ClusterRuntimeHealthGovernanceRegistryManifest } from '../agent-gateway/cluster-runtime-health-governance-registry-manifest.ts'

const generatedAt = '2026-07-26T05:00:00.000Z'
const safety = Object.freeze({
  readOnly: true as const,
  advisoryOnly: true as const,
  automaticRetryEnabled: false as const,
  automaticRepairEnabled: false as const,
  infrastructureMutationEnabled: false as const,
})
const firstEntry = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-registry-manifest-entry-v1' as const,
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
const duplicateEntry = Object.freeze({ ...firstEntry, provenance: Object.freeze(['agent-gateway-runtime-health', 'registry']) })
const manifest = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-registry-manifest-v1' as const,
  manifestId: 'gateway-east:manifest',
  clusterId: 'gateway-east',
  generatedAt,
  registryId: 'gateway-east:registry',
  catalogId: 'gateway-east:catalog',
  archiveId: 'gateway-east:archive',
  snapshotId: 'gateway-east:snapshot',
  entryCount: 2,
  entries: Object.freeze([firstEntry, duplicateEntry]),
  statistics: Object.freeze({ dashboard: 2 }),
  schemaInventory: Object.freeze({ 'agent-gateway-cluster-runtime-health-dashboard-v1': 2 }),
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'fedcba98', canonical: true as const, appendOnlyCompatible: true as const }),
  retentionClass: 'governance-evidence' as const,
  safety,
  executable: false as const,
}) satisfies ClusterRuntimeHealthGovernanceRegistryManifest

test('creates identical immutable evidence bundles with canonical inventories', () => {
  const first = createClusterRuntimeHealthGovernanceEvidenceBundle(manifest)
  const second = createClusterRuntimeHealthGovernanceEvidenceBundle(manifest)
  assert.deepEqual(first, second)
  assert.equal(first.entryCount, 2)
  assert.equal(first.statistics.dashboard, 1)
  assert.equal(first.statistics['governance-registry-manifest'], 1)
  assert.equal(first.schemaInventory['agent-gateway-cluster-runtime-health-dashboard-v1'], 1)
  assert.equal(first.manifestId, manifest.manifestId)
  assert.equal(first.registryId, manifest.registryId)
  assert.equal(first.catalogId, manifest.catalogId)
  assert.equal(first.archiveId, manifest.archiveId)
  assert.equal(first.snapshotId, manifest.snapshotId)
  assert.match(first.integrity.digest, /^[0-9a-f]{8}$/)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.entries), true)
  assert.equal(Object.isFrozen(first.statistics), true)
  assert.equal(Object.isFrozen(first.schemaInventory), true)
  assert.equal(first.executable, false)
})

test('fails closed for malformed, unsafe, mismatched, and inconsistent manifests', () => {
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceBundle({ ...manifest, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthGovernanceRegistryManifest), /invalid/)
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceBundle({ ...manifest, safety: { ...safety, infrastructureMutationEnabled: true } } as unknown as ClusterRuntimeHealthGovernanceRegistryManifest), /unsafe/)
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceBundle({ ...manifest, entryCount: 1 } as ClusterRuntimeHealthGovernanceRegistryManifest), /count/)
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceBundle({ ...manifest, generatedAt: 'bad-date' } as ClusterRuntimeHealthGovernanceRegistryManifest), /identity/)
  const badEntry = { ...firstEntry, generatedAt: '2026-07-26T06:00:00.000Z' }
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceBundle({ ...manifest, entries: [badEntry, duplicateEntry] } as unknown as ClusterRuntimeHealthGovernanceRegistryManifest), /entry/)
})
