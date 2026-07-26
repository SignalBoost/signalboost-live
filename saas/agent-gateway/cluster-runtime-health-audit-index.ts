// saas/agent-gateway/cluster-runtime-health-audit-index.ts
// Deterministic, immutable audit index for governed runtime health evidence.

import type { ClusterRuntimeHealthEvidenceManifest, ClusterRuntimeHealthEvidenceReference } from './cluster-runtime-health-evidence-manifest.ts'

export interface ClusterRuntimeHealthAuditRecord {
  schemaVersion: 'agent-gateway-cluster-runtime-health-audit-record-v1'
  artifactId: string
  kind: ClusterRuntimeHealthEvidenceReference['kind'] | 'manifest'
  schema: string
  integrityDigest: string
  generatedAt: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthAuditIndex {
  schemaVersion: 'agent-gateway-cluster-runtime-health-audit-index-v1'
  auditIndexId: string
  clusterId: string
  generatedAt: string
  evidenceCount: number
  records: readonly ClusterRuntimeHealthAuditRecord[]
  integrity: Readonly<{ algorithm: 'fnv1a-32'; digest: string; canonical: true }>
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

export function createClusterRuntimeHealthAuditIndex(manifest: ClusterRuntimeHealthEvidenceManifest): ClusterRuntimeHealthAuditIndex {
  if (!manifest || manifest.schemaVersion !== 'agent-gateway-cluster-runtime-health-evidence-manifest-v1') throw new Error('invalid cluster runtime health audit manifest')
  if (manifest.executable !== false || manifest.safety.readOnly !== true || manifest.safety.advisoryOnly !== true || manifest.safety.infrastructureMutationEnabled !== false) throw new Error('unsafe cluster runtime health audit manifest')
  if (!manifest.clusterId || !Number.isFinite(Date.parse(manifest.generatedAt))) throw new Error('invalid cluster runtime health audit identity')
  if (manifest.integrity.algorithm !== 'fnv1a-32' || manifest.integrity.canonical !== true || !/^[0-9a-f]{8}$/.test(manifest.integrity.digest)) throw new Error('invalid cluster runtime health audit integrity')

  const raw: ClusterRuntimeHealthAuditRecord[] = manifest.references.map(reference => {
    if (reference.schemaVersion !== 'agent-gateway-cluster-runtime-health-evidence-reference-v1' || reference.generatedAt !== manifest.generatedAt || reference.readOnly !== true || reference.executable !== false || !/^[0-9a-f]{8}$/.test(reference.integrityDigest)) throw new Error('invalid cluster runtime health audit reference')
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-audit-record-v1' as const,
      artifactId: reference.artifactId,
      kind: reference.kind,
      schema: reference.schema,
      integrityDigest: reference.integrityDigest,
      generatedAt: reference.generatedAt,
      provenance: Object.freeze([reference.provenance, manifest.manifestId]),
      retentionClass: manifest.retentionClass,
      readOnly: true as const,
      executable: false as const,
    })
  })

  raw.push(Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-audit-record-v1',
    artifactId: manifest.manifestId,
    kind: 'manifest',
    schema: manifest.schemaVersion,
    integrityDigest: manifest.integrity.digest,
    generatedAt: manifest.generatedAt,
    provenance: Object.freeze(['agent-gateway-runtime-health']),
    retentionClass: manifest.retentionClass,
    readOnly: true,
    executable: false,
  }))

  const records = [...new Map(raw.map(record => [record.artifactId, record])).values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.artifactId.localeCompare(b.artifactId))
  const integrity = Object.freeze({ algorithm: 'fnv1a-32' as const, digest: digest(records), canonical: true as const })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-audit-index-v1',
    auditIndexId: `${manifest.clusterId}:${manifest.generatedAt}:${integrity.digest}`,
    clusterId: manifest.clusterId,
    generatedAt: manifest.generatedAt,
    evidenceCount: records.length,
    records: Object.freeze(records),
    integrity,
    retentionClass: manifest.retentionClass,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
