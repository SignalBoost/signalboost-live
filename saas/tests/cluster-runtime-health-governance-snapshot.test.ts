import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceSnapshot } from '../agent-gateway/cluster-runtime-health-governance-snapshot.ts'
import type { ClusterRuntimeHealthGovernanceChain } from '../agent-gateway/cluster-runtime-health-governance-chain.ts'

const generatedAt = '2026-07-26T01:20:00.000Z'
const safety = Object.freeze({ readOnly: true as const, advisoryOnly: true as const, automaticRetryEnabled: false as const, automaticRepairEnabled: false as const, infrastructureMutationEnabled: false as const })
const firstLink = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-chain-link-v1' as const,
  position: 0,
  artifactId: 'gateway-east:artifact',
  kind: 'dashboard' as const,
  schema: 'agent-gateway-cluster-runtime-health-dashboard-v1',
  generatedAt,
  integrityDigest: '1234abcd',
  previousLinkDigest: null,
  cumulativeDigest: '89abcdef',
  provenance: Object.freeze(['agent-gateway-runtime-health']),
  retentionClass: 'governance-evidence' as const,
  readOnly: true as const,
  executable: false as const,
})
const duplicateLink = Object.freeze({ ...firstLink, position: 1, previousLinkDigest: firstLink.cumulativeDigest, cumulativeDigest: '76543210' })
const chain = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-chain-v1' as const,
  chainId: 'gateway-east:chain',
  clusterId: 'gateway-east',
  generatedAt,
  artifactCount: 2,
  links: Object.freeze([firstLink, duplicateLink]),
  headDigest: '76543210',
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'fedcba98', canonical: true as const, appendOnly: true as const }),
  retentionClass: 'governance-evidence' as const,
  safety,
  executable: false as const,
}) satisfies ClusterRuntimeHealthGovernanceChain

test('creates identical immutable governance snapshots with duplicate suppression', () => {
  const first = createClusterRuntimeHealthGovernanceSnapshot(chain)
  const second = createClusterRuntimeHealthGovernanceSnapshot(chain)
  assert.deepEqual(first, second)
  assert.equal(first.artifactCount, 2)
  assert.equal(first.chainHeadDigest, '76543210')
  assert.match(first.cumulativeIntegrityDigest, /^[0-9a-f]{8}$/)
  assert.equal(Object.isFrozen(first), true)
  assert.equal(first.executable, false)
})

test('fails closed for malformed, unsafe, mismatched, and broken chain inputs', () => {
  assert.throws(() => createClusterRuntimeHealthGovernanceSnapshot({ ...chain, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthGovernanceChain), /invalid/)
  assert.throws(() => createClusterRuntimeHealthGovernanceSnapshot({ ...chain, safety: { ...safety, infrastructureMutationEnabled: true } } as unknown as ClusterRuntimeHealthGovernanceChain), /unsafe/)
  assert.throws(() => createClusterRuntimeHealthGovernanceSnapshot({ ...chain, artifactCount: 1 } as ClusterRuntimeHealthGovernanceChain), /count/)
  const badLink = { ...firstLink, position: 1 }
  assert.throws(() => createClusterRuntimeHealthGovernanceSnapshot({ ...chain, links: [badLink, duplicateLink] } as unknown as ClusterRuntimeHealthGovernanceChain), /link/)
})
