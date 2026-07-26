// saas/agent-gateway/cluster-runtime-health-governance-ledger.ts
// Deterministic, immutable governance ledger for runtime health audit evidence.

import type { ClusterRuntimeHealthAuditIndex, ClusterRuntimeHealthAuditRecord } from './cluster-runtime-health-audit-index.ts'

export interface ClusterRuntimeHealthGovernanceLedgerEntry {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-ledger-entry-v1'
  sequence: number
  artifactId: string
  kind: ClusterRuntimeHealthAuditRecord['kind'] | 'audit-index'
  schema: string
  generatedAt: string
  integrityDigest: string
  previousDigest: string | null
  chainDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceLedger {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-ledger-v1'
  ledgerId: string
  clusterId: string
  generatedAt: string
  entryCount: number
  entries: readonly ClusterRuntimeHealthGovernanceLedgerEntry[]
  integrity: Readonly<{ algorithm: 'fnv1a-32'; digest: string; canonical: true; chained: true }>
  retentionClass: 'governance-evidence'
  safety: Readonly<{ readOnly: true; advisoryOnly: true; automaticRetryEnabled: false; automaticRepairEnabled: false; infrastructureMutationEnabled: false }>
  executable: false
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: unknown): string {
  const input = canonical(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function createClusterRuntimeHealthGovernanceLedger(index: ClusterRuntimeHealthAuditIndex): ClusterRuntimeHealthGovernanceLedger {
  if (!index || index.schemaVersion !== 'agent-gateway-cluster-runtime-health-audit-index-v1') throw new Error('invalid cluster runtime health governance ledger index')
  if (index.executable !== false || index.safety.readOnly !== true || index.safety.advisoryOnly !== true || index.safety.infrastructureMutationEnabled !== false) throw new Error('unsafe cluster runtime health governance ledger index')
  if (!index.clusterId || !Number.isFinite(Date.parse(index.generatedAt))) throw new Error('invalid cluster runtime health governance ledger identity')
  if (index.integrity.algorithm !== 'fnv1a-32' || index.integrity.canonical !== true || !/^[0-9a-f]{8}$/.test(index.integrity.digest)) throw new Error('invalid cluster runtime health governance ledger integrity')

  const raw = index.records.map(record => {
    if (record.schemaVersion !== 'agent-gateway-cluster-runtime-health-audit-record-v1' || record.generatedAt !== index.generatedAt || record.readOnly !== true || record.executable !== false || !/^[0-9a-f]{8}$/.test(record.integrityDigest)) throw new Error('invalid cluster runtime health governance ledger record')
    return {
      artifactId: record.artifactId,
      kind: record.kind,
      schema: record.schema,
      generatedAt: record.generatedAt,
      integrityDigest: record.integrityDigest,
      provenance: [...record.provenance, index.auditIndexId],
      retentionClass: record.retentionClass,
    }
  })
  raw.push({
    artifactId: index.auditIndexId,
    kind: 'audit-index',
    schema: index.schemaVersion,
    generatedAt: index.generatedAt,
    integrityDigest: index.integrity.digest,
    provenance: ['agent-gateway-runtime-health'],
    retentionClass: index.retentionClass,
  })

  const ordered = [...new Map(raw.map(record => [record.artifactId, record])).values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.artifactId.localeCompare(b.artifactId))
  let previousDigest: string | null = null
  const entries = ordered.map((record, sequence) => {
    const chainDigest = digest({ sequence, previousDigest, artifactId: record.artifactId, integrityDigest: record.integrityDigest })
    const entry = Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-ledger-entry-v1' as const,
      sequence,
      ...record,
      previousDigest,
      chainDigest,
      provenance: Object.freeze(record.provenance),
      readOnly: true as const,
      executable: false as const,
    })
    previousDigest = chainDigest
    return entry
  })
  const integrity = Object.freeze({ algorithm: 'fnv1a-32' as const, digest: digest(entries), canonical: true as const, chained: true as const })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-ledger-v1',
    ledgerId: `${index.clusterId}:${index.generatedAt}:${integrity.digest}`,
    clusterId: index.clusterId,
    generatedAt: index.generatedAt,
    entryCount: entries.length,
    entries: Object.freeze(entries),
    integrity,
    retentionClass: index.retentionClass,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
