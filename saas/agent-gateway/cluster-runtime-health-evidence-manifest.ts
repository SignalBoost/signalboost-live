// saas/agent-gateway/cluster-runtime-health-evidence-manifest.ts
// Deterministic, immutable evidence manifest for governed runtime health advisory artifacts.

import type { ClusterRuntimeHealthExportBundle } from './cluster-runtime-health-export.ts'

export type ClusterRuntimeHealthEvidenceKind = 'dashboard' | 'timeline-summary' | 'trend' | 'forecast' | 'recommendations' | 'export'

export interface ClusterRuntimeHealthEvidenceReference {
  schemaVersion: 'agent-gateway-cluster-runtime-health-evidence-reference-v1'
  artifactId: string
  kind: ClusterRuntimeHealthEvidenceKind
  schema: string
  generatedAt: string
  integrityDigest: string
  provenance: 'agent-gateway-runtime-health'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthEvidenceManifest {
  schemaVersion: 'agent-gateway-cluster-runtime-health-evidence-manifest-v1'
  manifestId: string
  clusterId: string
  generatedAt: string
  retentionClass: 'governance-evidence'
  references: readonly ClusterRuntimeHealthEvidenceReference[]
  integrity: Readonly<{ algorithm: 'fnv1a-32'; digest: string; canonical: true }>
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

export function createClusterRuntimeHealthEvidenceManifest(bundle: ClusterRuntimeHealthExportBundle): ClusterRuntimeHealthEvidenceManifest {
  if (!bundle || bundle.schemaVersion !== 'agent-gateway-cluster-runtime-health-export-v1') throw new Error('invalid cluster runtime health evidence export')
  if (bundle.executable !== false || bundle.safety.readOnly !== true || bundle.safety.advisoryOnly !== true || bundle.safety.infrastructureMutationEnabled !== false) throw new Error('unsafe cluster runtime health evidence export')
  if (!bundle.clusterId || !Number.isFinite(Date.parse(bundle.generatedAt))) throw new Error('invalid cluster runtime health evidence identity')
  if (bundle.integrity.algorithm !== 'fnv1a-32' || bundle.integrity.canonical !== true || !/^[0-9a-f]{8}$/.test(bundle.integrity.digest)) throw new Error('invalid cluster runtime health evidence integrity')

  const raw = [
    { kind: 'dashboard' as const, artifactId: `${bundle.clusterId}:${bundle.generatedAt}:dashboard`, schema: bundle.dashboard.schemaVersion, value: bundle.dashboard },
    { kind: 'timeline-summary' as const, artifactId: `${bundle.clusterId}:${bundle.generatedAt}:timeline-summary`, schema: 'agent-gateway-cluster-runtime-health-timeline-summary-v1', value: bundle.timelineSummary },
    { kind: 'trend' as const, artifactId: `${bundle.clusterId}:${bundle.generatedAt}:trend`, schema: bundle.trend.schemaVersion, value: bundle.trend },
    { kind: 'forecast' as const, artifactId: `${bundle.clusterId}:${bundle.generatedAt}:forecast`, schema: bundle.forecast.schemaVersion, value: bundle.forecast },
    { kind: 'recommendations' as const, artifactId: `${bundle.clusterId}:${bundle.generatedAt}:recommendations`, schema: bundle.recommendations.schemaVersion, value: bundle.recommendations },
    { kind: 'export' as const, artifactId: bundle.exportId, schema: bundle.schemaVersion, value: { exportId: bundle.exportId, integrity: bundle.integrity } },
  ]

  const unique = new Map(raw.map(reference => [reference.artifactId, reference]))
  const references = [...unique.values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.artifactId.localeCompare(b.artifactId))
    .map(reference => Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-evidence-reference-v1' as const,
      artifactId: reference.artifactId,
      kind: reference.kind,
      schema: reference.schema,
      generatedAt: bundle.generatedAt,
      integrityDigest: digest(reference.value),
      provenance: 'agent-gateway-runtime-health' as const,
      readOnly: true as const,
      executable: false as const,
    }))

  const integrity = Object.freeze({ algorithm: 'fnv1a-32' as const, digest: digest(references), canonical: true as const })
  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-evidence-manifest-v1',
    manifestId: `${bundle.clusterId}:${bundle.generatedAt}:${integrity.digest}`,
    clusterId: bundle.clusterId,
    generatedAt: bundle.generatedAt,
    retentionClass: 'governance-evidence',
    references: Object.freeze(references),
    integrity,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
