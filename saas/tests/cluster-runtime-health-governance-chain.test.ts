import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceChain } from '../agent-gateway/cluster-runtime-health-governance-chain.ts'
import type { ClusterRuntimeHealthGovernanceLedger } from '../agent-gateway/cluster-runtime-health-governance-ledger.ts'

const generatedAt = '2026-07-26T00:45:00.000Z'
const safety = Object.freeze({ readOnly: true as const, advisoryOnly: true as const, automaticRetryEnabled: false as const, automaticRepairEnabled: false as const, infrastructureMutationEnabled: false as const })
const first = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-ledger-entry-v1' as const, sequence: 0, artifactId: 'artifact-a', kind: 'dashboard' as const, schema: 'dashboard-v1', generatedAt, integrityDigest: '11111111', previousDigest: null, chainDigest: 'aaaaaaaa', provenance: Object.freeze(['agent-gateway-runtime-health']), retentionClass: 'governance-evidence' as const, readOnly: true as const, executable: false as const })
const second = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-ledger-entry-v1' as const, sequence: 1, artifactId: 'artifact-b', kind: 'forecast' as const, schema: 'forecast-v1', generatedAt, integrityDigest: '22222222', previousDigest: 'aaaaaaaa', chainDigest: 'bbbbbbbb', provenance: Object.freeze(['agent-gateway-runtime-health']), retentionClass: 'governance-evidence' as const, readOnly: true as const, executable: false as const })
const ledger = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-ledger-v1' as const, ledgerId: 'gateway-east:ledger', clusterId: 'gateway-east', generatedAt, entryCount: 2, entries: Object.freeze([first, second]), integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: 'cccccccc', canonical: true as const, chained: true as const }), retentionClass: 'governance-evidence' as const, safety, executable: false as const }) satisfies ClusterRuntimeHealthGovernanceLedger

test('creates identical immutable governance chains with valid cumulative linkage', () => {
  const a = createClusterRuntimeHealthGovernanceChain(ledger)
  const b = createClusterRuntimeHealthGovernanceChain(ledger)
  assert.deepEqual(a, b)
  assert.equal(a.artifactCount, 3)
  assert.equal(a.links[0]?.previousLinkDigest, null)
  assert.equal(a.links[1]?.previousLinkDigest, a.links[0]?.cumulativeDigest)
  assert.equal(a.headDigest, a.links.at(-1)?.cumulativeDigest)
  assert.equal(a.integrity.appendOnly, true)
  assert.equal(a.executable, false)
  assert.equal(Object.isFrozen(a), true)
})

test('fails closed for malformed, unsafe, and broken ledger linkage', () => {
  assert.throws(() => createClusterRuntimeHealthGovernanceChain({ ...ledger, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthGovernanceLedger), /invalid/)
  assert.throws(() => createClusterRuntimeHealthGovernanceChain({ ...ledger, executable: true } as unknown as ClusterRuntimeHealthGovernanceLedger), /unsafe/)
  assert.throws(() => createClusterRuntimeHealthGovernanceChain({ ...ledger, entries: Object.freeze([first, { ...second, previousDigest: 'deadbeef' }]) } as ClusterRuntimeHealthGovernanceLedger), /linkage/)
  assert.throws(() => createClusterRuntimeHealthGovernanceChain({ ...ledger, integrity: { ...ledger.integrity, digest: 'bad' } } as ClusterRuntimeHealthGovernanceLedger), /integrity/)
})
