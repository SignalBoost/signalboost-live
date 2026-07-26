import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceArchive } from '../agent-gateway/cluster-runtime-health-governance-archive.ts'
import type { ClusterRuntimeHealthGovernanceSnapshot } from '../agent-gateway/cluster-runtime-health-governance-snapshot.ts'

const generatedAt = '2026-07-26T03:10:00.000Z'
const safety = Object.freeze({
  readOnly: true as const,
  advisoryOnly: true as const,
  automaticRetryEnabled: false as const,
  automaticRepairEnabled: false as const,
  infrastructureMutationEnabled: false as const,
})
const artifact = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-snapshot-artifact-v1' as const,
  artifactId: 'gateway-east:dashboard',
  kind: 'dashboard' as const,
  schema: 'agent-gateway-cluster-runtime-health-dashboard-v1',
  generatedAt,
  integrityDigest: '1234abcd',
  provenance: Object.freeze(['agent-gateway-runtime-health']),
  retentionClass: 'governance-evidence' as const,
  readOnly: true as const,
  executable: false as const,
})
const snapshot = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-snapshot-v1' as const,
  snapshotId: 'gateway-east:snapshot',
  clusterId: 'gateway-east',
  generatedAt,
  chainId: 'gateway-east:chain',
  chainHeadDigest: '89abcdef',
  artifactCount: 2,
  artifacts: Object.freeze([artifact, artifact]),
  cumulativeIntegrityDigest: 'fedcba98',
  retentionClass: 'governance-evidence' as const,
  safety,
  executable: false as const,
}) satisfies ClusterRuntimeHealthGovernanceSnapshot

test('creates identical immutable archives with deterministic duplicate suppression', () => {
  const first = createClusterRuntimeHealthGovernanceArchive(snapshot)
  const second = createClusterRuntimeHealthGovernanceArchive(snapshot)

  assert.deepEqual(first, second)
  assert.equal(first.itemCount, 2)
  assert.equal(first.snapshotId, snapshot.snapshotId)
  assert.equal(first.snapshotIntegrityDigest, snapshot.cumulativeIntegrityDigest)
  assert.equal(first.items[0]?.kind, 'dashboard')
  assert.equal(first.items[1]?.kind, 'governance-snapshot')
  assert.match(first.integrity.digest, /^[0-9a-f]{8}$/)
  assert.equal(first.integrity.appendOnlyCompatible, true)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(Object.isFrozen(first.items), true)
  assert.equal(first.executable, false)
})

test('fails closed for malformed, unsafe, mismatched, and invalid snapshot inputs', () => {
  assert.throws(
    () => createClusterRuntimeHealthGovernanceArchive({ ...snapshot, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthGovernanceSnapshot),
    /invalid/,
  )
  assert.throws(
    () => createClusterRuntimeHealthGovernanceArchive({ ...snapshot, safety: { ...safety, infrastructureMutationEnabled: true } } as unknown as ClusterRuntimeHealthGovernanceSnapshot),
    /unsafe/,
  )
  assert.throws(
    () => createClusterRuntimeHealthGovernanceArchive({ ...snapshot, artifactCount: 1 } as ClusterRuntimeHealthGovernanceSnapshot),
    /count/,
  )
  assert.throws(
    () => createClusterRuntimeHealthGovernanceArchive({ ...snapshot, generatedAt: 'not-a-date' } as ClusterRuntimeHealthGovernanceSnapshot),
    /identity/,
  )
  assert.throws(
    () => createClusterRuntimeHealthGovernanceArchive({ ...snapshot, cumulativeIntegrityDigest: 'bad' } as ClusterRuntimeHealthGovernanceSnapshot),
    /integrity/,
  )
  assert.throws(
    () => createClusterRuntimeHealthGovernanceArchive({ ...snapshot, artifacts: [{ ...artifact, generatedAt: '2026-07-26T03:11:00.000Z' }, artifact] } as unknown as ClusterRuntimeHealthGovernanceSnapshot),
    /item/,
  )
})
