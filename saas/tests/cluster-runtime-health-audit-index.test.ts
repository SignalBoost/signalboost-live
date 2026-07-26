import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthAuditIndex } from '../agent-gateway/cluster-runtime-health-audit-index.ts'
import type { ClusterRuntimeHealthEvidenceManifest } from '../agent-gateway/cluster-runtime-health-evidence-manifest.ts'

const generatedAt = '2026-07-26T00:30:00.000Z'
const reference = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-evidence-reference-v1' as const,
  artifactId: 'gateway-east:artifact',
  kind: 'dashboard' as const,
  schema: 'agent-gateway-cluster-runtime-health-dashboard-v1',
  generatedAt,
  integrityDigest: '1234abcd',
  provenance: 'agent-gateway-runtime-health' as const,
  readOnly: true as const,
  executable: false as const,
})
const manifest = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-evidence-manifest-v1' as const,
  manifestId: 'gateway-east:manifest',
  clusterId: 'gateway-east',
  generatedAt,
  retentionClass: 'governance-evidence' as const,
  references: Object.freeze([reference, reference]),
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'deadbeef', canonical: true as const }),
  safety: Object.freeze({ readOnly: true as const, advisoryOnly: true as const, automaticRetryEnabled: false as const, automaticRepairEnabled: false as const, infrastructureMutationEnabled: false as const }),
  executable: false as const,
}) satisfies ClusterRuntimeHealthEvidenceManifest

test('creates deterministic immutable audit indexes with duplicate suppression', () => {
  const first = createClusterRuntimeHealthAuditIndex(manifest)
  const second = createClusterRuntimeHealthAuditIndex(manifest)
  assert.deepEqual(first, second)
  assert.equal(first.evidenceCount, 2)
  assert.deepEqual(first.records.map(record => record.kind), ['dashboard', 'manifest'])
  assert.equal(Object.isFrozen(first), true)
  assert.equal(first.executable, false)
})

test('fails closed for invalid schema, generation, integrity, and safety', () => {
  assert.throws(() => createClusterRuntimeHealthAuditIndex({ ...manifest, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthEvidenceManifest), /invalid/)
  assert.throws(() => createClusterRuntimeHealthAuditIndex({ ...manifest, references: [{ ...reference, generatedAt: '2026-07-26T00:31:00.000Z' }] } as ClusterRuntimeHealthEvidenceManifest), /reference/)
  assert.throws(() => createClusterRuntimeHealthAuditIndex({ ...manifest, integrity: { ...manifest.integrity, digest: 'bad' } } as ClusterRuntimeHealthEvidenceManifest), /integrity/)
  assert.throws(() => createClusterRuntimeHealthAuditIndex({ ...manifest, executable: true } as unknown as ClusterRuntimeHealthEvidenceManifest), /unsafe/)
})
