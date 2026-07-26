import assert from 'node:assert/strict'
import test from 'node:test'
import { queryClusterRuntimeHealthGovernanceEvidenceIndex } from '../agent-gateway/cluster-runtime-health-governance-evidence-index-query.ts'
import type { ClusterRuntimeHealthGovernanceEvidenceIndex, ClusterRuntimeHealthGovernanceEvidenceIndexEntry } from '../agent-gateway/cluster-runtime-health-governance-evidence-index.ts'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}` }
  return JSON.stringify(value)
}
function digest(value: unknown): string { const input = canonical(value); let hash = 0x811c9dc5; for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0 }; return hash.toString(16).padStart(8, '0') }
const generatedAt = '2026-07-26T06:55:00.000Z'
const safety = Object.freeze({ readOnly: true as const, advisoryOnly: true as const, automaticRetryEnabled: false as const, automaticRepairEnabled: false as const, infrastructureMutationEnabled: false as const })
const entries: readonly ClusterRuntimeHealthGovernanceEvidenceIndexEntry[] = Object.freeze([
  Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1' as const, artifactId: 'a-dashboard', kind: 'dashboard' as const, schema: 'dashboard-v1', generatedAt, integrityDigest: '11111111', provenance: Object.freeze(['runtime-health', 'bundle-1']), retentionClass: 'governance-evidence' as const, readOnly: true as const, executable: false as const }),
  Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1' as const, artifactId: 'b-manifest', kind: 'evidence-manifest' as const, schema: 'manifest-v1', generatedAt, integrityDigest: '22222222', provenance: Object.freeze(['runtime-health', 'bundle-1']), retentionClass: 'governance-evidence' as const, readOnly: true as const, executable: false as const }),
  Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1' as const, artifactId: 'c-bundle', kind: 'governance-evidence-bundle' as const, schema: 'bundle-v1', generatedAt, integrityDigest: '33333333', provenance: Object.freeze(['runtime-health']), retentionClass: 'governance-evidence' as const, readOnly: true as const, executable: false as const }),
])
const identity = Object.freeze({ bundleId: 'bundle-1', manifestId: 'manifest-1', registryId: 'registry-1', catalogId: 'catalog-1', archiveId: 'archive-1', snapshotId: 'snapshot-1' })
const statistics = Object.freeze({ dashboard: 1, 'evidence-manifest': 1, 'governance-evidence-bundle': 1 })
const schemaInventory = Object.freeze({ 'dashboard-v1': 1, 'manifest-v1': 1, 'bundle-v1': 1 })
const indexDigest = digest({ ...identity, entries, statistics, schemaInventory })
const index = Object.freeze({ schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-v1' as const, indexId: `gateway-east:${generatedAt}:bundle:${indexDigest}`, clusterId: 'gateway-east', generatedAt, ...identity, entryCount: entries.length, entries, statistics, schemaInventory, integrity: Object.freeze({ algorithm: 'fnv1a-32' as const, digest: indexDigest, canonical: true as const, appendOnlyCompatible: true as const }), retentionClass: 'governance-evidence' as const, safety, executable: false as const }) satisfies ClusterRuntimeHealthGovernanceEvidenceIndex

test('queries deterministically with immutable filter-bound pagination', () => {
  const first = queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { provenance: ['bundle-1'], limit: 1 })
  assert.equal(first.entries[0]?.artifactId, 'a-dashboard')
  assert.equal(Object.isFrozen(first.entries[0]), true)
  assert.equal(Object.isFrozen(first.entries[0]?.provenance), true)
  const second = queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { provenance: ['bundle-1'], limit: 1, cursor: first.nextCursor ?? undefined })
  assert.equal(second.entries[0]?.artifactId, 'b-manifest')
})

test('fails closed for altered indexes, unknown keys, identity changes, and invalid limits', () => {
  const [a, b, c] = entries
  assert.ok(a && b && c)
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex({ ...index, entries: Object.freeze([{ ...a, schema: 'altered' }, b, c]) } as unknown as ClusterRuntimeHealthGovernanceEvidenceIndex), /integrity digest/)
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { artifactId: ['a-dashboard'] }), /query key/)
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { limit: 0 }), /limit/)
  const first = queryClusterRuntimeHealthGovernanceEvidenceIndex(index, { provenance: ['bundle-1'], limit: 1 })
  assert.throws(() => queryClusterRuntimeHealthGovernanceEvidenceIndex({ ...index, clusterId: 'forged' }, { provenance: ['bundle-1'], limit: 1, cursor: first.nextCursor ?? undefined }), /cursor/)
})
