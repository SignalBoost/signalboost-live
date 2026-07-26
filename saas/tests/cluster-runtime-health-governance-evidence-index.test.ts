import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceEvidenceIndex } from '../agent-gateway/cluster-runtime-health-governance-evidence-index.ts'
import type { ClusterRuntimeHealthGovernanceEvidenceBundle } from '../agent-gateway/cluster-runtime-health-governance-evidence-bundle.ts'

const generatedAt = '2026-07-26T06:30:00.000Z'
const safety = Object.freeze({
  readOnly: true as const,
  advisoryOnly: true as const,
  automaticRetryEnabled: false as const,
  automaticRepairEnabled: false as const,
  infrastructureMutationEnabled: false as const,
})
const entry = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-bundle-entry-v1' as const,
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
const bundle = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-bundle-v1' as const,
  bundleId: 'gateway-east:bundle',
  clusterId: 'gateway-east',
  generatedAt,
  manifestId: 'gateway-east:manifest',
  registryId: 'gateway-east:registry',
  catalogId: 'gateway-east:catalog',
  archiveId: 'gateway-east:archive',
  snapshotId: 'gateway-east:snapshot',
  entryCount: 2,
  entries: Object.freeze([entry, Object.freeze({ ...entry, provenance: Object.freeze(['agent-gateway-runtime-health', 'duplicate']) })]),
  statistics: Object.freeze({ dashboard: 2 }),
  schemaInventory: Object.freeze({ 'agent-gateway-cluster-runtime-health-dashboard-v1': 2 }),
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'fedcba98', canonical: true as const, appendOnlyCompatible: true as const }),
  retentionClass: 'governance-evidence' as const,
  safety,
  executable: false as const,
}) satisfies ClusterRuntimeHealthGovernanceEvidenceBundle

test('creates identical immutable evidence indexes with canonical inventories', () => {
  const first = createClusterRuntimeHealthGovernanceEvidenceIndex(bundle)
  const second = createClusterRuntimeHealthGovernanceEvidenceIndex(bundle)
  assert.deepEqual(first, second)
  assert.equal(first.entryCount, 2)
  assert.equal(first.statistics.dashboard, 1)
  assert.equal(first.statistics['governance-evidence-bundle'], 1)
  assert.equal(first.schemaInventory['agent-gateway-cluster-runtime-health-dashboard-v1'], 1)
  assert.equal(first.bundleId, bundle.bundleId)
  assert.match(first.integrity.digest, /^[0-9a-f]{8}$/)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.entries), true)
  assert.equal(Object.isFrozen(first.statistics), true)
  assert.equal(Object.isFrozen(first.schemaInventory), true)
  assert.equal(first.executable, false)
})

test('fails closed for malformed, unsafe, mismatched, and inconsistent bundles', () => {
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceIndex({ ...bundle, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthGovernanceEvidenceBundle), /invalid/)
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceIndex({ ...bundle, safety: { ...safety, infrastructureMutationEnabled: true } } as unknown as ClusterRuntimeHealthGovernanceEvidenceBundle), /unsafe/)
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceIndex({ ...bundle, entryCount: 1 } as ClusterRuntimeHealthGovernanceEvidenceBundle), /count/)
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceIndex({ ...bundle, generatedAt: 'bad-date' } as ClusterRuntimeHealthGovernanceEvidenceBundle), /identity/)
  const badEntry = { ...entry, generatedAt: '2026-07-26T07:00:00.000Z' }
  assert.throws(() => createClusterRuntimeHealthGovernanceEvidenceIndex({ ...bundle, entries: [badEntry, entry] } as unknown as ClusterRuntimeHealthGovernanceEvidenceBundle), /entry/)
})
