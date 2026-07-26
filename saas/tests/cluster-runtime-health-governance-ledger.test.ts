import assert from 'node:assert/strict'
import test from 'node:test'

import { createClusterRuntimeHealthGovernanceLedger } from '../agent-gateway/cluster-runtime-health-governance-ledger.ts'
import type { ClusterRuntimeHealthAuditIndex } from '../agent-gateway/cluster-runtime-health-audit-index.ts'

const generatedAt = '2026-07-26T00:30:00.000Z'
const record = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-audit-record-v1' as const,
  artifactId: 'gateway-east:artifact',
  kind: 'dashboard' as const,
  schema: 'agent-gateway-cluster-runtime-health-dashboard-v1',
  integrityDigest: '1234abcd',
  generatedAt,
  provenance: Object.freeze(['agent-gateway-runtime-health']),
  retentionClass: 'governance-evidence' as const,
  readOnly: true as const,
  executable: false as const,
})
const index = Object.freeze({
  schemaVersion: 'agent-gateway-cluster-runtime-health-audit-index-v1' as const,
  auditIndexId: 'gateway-east:index',
  clusterId: 'gateway-east',
  generatedAt,
  evidenceCount: 2,
  records: Object.freeze([record, record]),
  integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: '89abcdef', canonical: true as const }),
  retentionClass: 'governance-evidence' as const,
  safety: Object.freeze({ readOnly: true as const, advisoryOnly: true as const, automaticRetryEnabled: false as const, automaticRepairEnabled: false as const, infrastructureMutationEnabled: false as const }),
  executable: false as const,
}) satisfies ClusterRuntimeHealthAuditIndex

test('creates identical immutable chained ledgers and suppresses duplicate artifacts', () => {
  const first = createClusterRuntimeHealthGovernanceLedger(index)
  const second = createClusterRuntimeHealthGovernanceLedger(index)
  assert.deepEqual(first, second)
  assert.equal(first.entryCount, 2)
  assert.equal(first.entries[0]?.sequence, 0)
  assert.equal(first.entries[0]?.previousDigest, null)
  assert.equal(first.entries[1]?.previousDigest, first.entries[0]?.chainDigest)
  assert.equal(first.integrity.chained, true)
  assert.equal(first.executable, false)
  assert.equal(Object.isFrozen(first), true)
})

test('fails closed for schema, identity, generation, integrity, and safety violations', () => {
  assert.throws(() => createClusterRuntimeHealthGovernanceLedger({ ...index, schemaVersion: 'bad' } as unknown as ClusterRuntimeHealthAuditIndex), /invalid/)
  assert.throws(() => createClusterRuntimeHealthGovernanceLedger({ ...index, clusterId: '' } as ClusterRuntimeHealthAuditIndex), /identity/)
  assert.throws(() => createClusterRuntimeHealthGovernanceLedger({ ...index, integrity: { ...index.integrity, digest: 'bad' } } as ClusterRuntimeHealthAuditIndex), /integrity/)
  assert.throws(() => createClusterRuntimeHealthGovernanceLedger({ ...index, records: [{ ...record, generatedAt: '2026-07-26T00:31:00.000Z' }] } as ClusterRuntimeHealthAuditIndex), /record/)
  assert.throws(() => createClusterRuntimeHealthGovernanceLedger({ ...index, safety: { ...index.safety, infrastructureMutationEnabled: true } } as unknown as ClusterRuntimeHealthAuditIndex), /unsafe/)
})
