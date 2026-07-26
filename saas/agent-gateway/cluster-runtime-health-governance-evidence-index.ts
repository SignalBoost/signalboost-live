// saas/agent-gateway/cluster-runtime-health-governance-evidence-index.ts
// Deterministic immutable lookup index for runtime health governance evidence.

import type {
  ClusterRuntimeHealthGovernanceEvidenceBundle,
  ClusterRuntimeHealthGovernanceEvidenceBundleEntry,
} from './cluster-runtime-health-governance-evidence-bundle.ts'

export interface ClusterRuntimeHealthGovernanceEvidenceIndexEntry {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1'
  artifactId: string
  kind: ClusterRuntimeHealthGovernanceEvidenceBundleEntry['kind'] | 'governance-evidence-bundle'
  schema: string
  generatedAt: string
  integrityDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceEvidenceIndex {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-v1'
  indexId: string
  clusterId: string
  generatedAt: string
  bundleId: string
  manifestId: string
  registryId: string
  catalogId: string
  archiveId: string
  snapshotId: string
  entryCount: number
  entries: readonly ClusterRuntimeHealthGovernanceEvidenceIndexEntry[]
  statistics: Readonly<Record<string, number>>
  schemaInventory: Readonly<Record<string, number>>
  integrity: Readonly<{ algorithm: 'fnv1a-32'; digest: string; canonical: true; appendOnlyCompatible: true }>
  retentionClass: 'governance-evidence'
  safety: Readonly<{
    readOnly: true
    advisoryOnly: true
    automaticRetryEnabled: false
    automaticRepairEnabled: false
    infrastructureMutationEnabled: false
  }>
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

function sortedCounts(values: readonly string[]): Readonly<Record<string, number>> {
  const counts = values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1
    return result
  }, {})
  return Object.freeze(Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))))
}

export function createClusterRuntimeHealthGovernanceEvidenceIndex(
  bundle: ClusterRuntimeHealthGovernanceEvidenceBundle,
): ClusterRuntimeHealthGovernanceEvidenceIndex {
  if (!bundle || bundle.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-bundle-v1') {
    throw new Error('invalid cluster runtime health governance evidence index bundle')
  }
  if (
    bundle.executable !== false || bundle.safety.readOnly !== true || bundle.safety.advisoryOnly !== true ||
    bundle.safety.automaticRetryEnabled !== false || bundle.safety.automaticRepairEnabled !== false ||
    bundle.safety.infrastructureMutationEnabled !== false
  ) {
    throw new Error('unsafe cluster runtime health governance evidence index bundle')
  }
  if (
    !bundle.bundleId || !bundle.manifestId || !bundle.registryId || !bundle.catalogId || !bundle.archiveId ||
    !bundle.snapshotId || !bundle.clusterId || !Number.isFinite(Date.parse(bundle.generatedAt))
  ) {
    throw new Error('invalid cluster runtime health governance evidence index identity')
  }
  if (
    bundle.integrity.algorithm !== 'fnv1a-32' || bundle.integrity.canonical !== true ||
    bundle.integrity.appendOnlyCompatible !== true || !/^[0-9a-f]{8}$/.test(bundle.integrity.digest)
  ) {
    throw new Error('invalid cluster runtime health governance evidence index integrity')
  }
  if (bundle.entryCount !== bundle.entries.length) {
    throw new Error('invalid cluster runtime health governance evidence index count')
  }

  const rawEntries: ClusterRuntimeHealthGovernanceEvidenceIndexEntry[] = bundle.entries.map(entry => {
    if (
      entry.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-bundle-entry-v1' ||
      entry.generatedAt !== bundle.generatedAt || entry.readOnly !== true || entry.executable !== false ||
      entry.retentionClass !== 'governance-evidence' || !entry.artifactId || !entry.schema ||
      !/^[0-9a-f]{8}$/.test(entry.integrityDigest)
    ) {
      throw new Error('invalid cluster runtime health governance evidence index entry')
    }
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1' as const,
      artifactId: entry.artifactId,
      kind: entry.kind,
      schema: entry.schema,
      generatedAt: entry.generatedAt,
      integrityDigest: entry.integrityDigest,
      provenance: Object.freeze([...entry.provenance, bundle.bundleId]),
      retentionClass: entry.retentionClass,
      readOnly: true as const,
      executable: false as const,
    })
  })

  rawEntries.push(Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1',
    artifactId: bundle.bundleId,
    kind: 'governance-evidence-bundle',
    schema: bundle.schemaVersion,
    generatedAt: bundle.generatedAt,
    integrityDigest: bundle.integrity.digest,
    provenance: Object.freeze(['agent-gateway-runtime-health']),
    retentionClass: bundle.retentionClass,
    readOnly: true,
    executable: false,
  }))

  const entries = [...new Map(rawEntries.map(entry => [entry.artifactId, entry])).values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.artifactId.localeCompare(right.artifactId))
  const statistics = sortedCounts(entries.map(entry => entry.kind))
  const schemaInventory = sortedCounts(entries.map(entry => entry.schema))
  const integrity = Object.freeze({
    algorithm: 'fnv1a-32' as const,
    digest: digest({ bundleId: bundle.bundleId, manifestId: bundle.manifestId, registryId: bundle.registryId, catalogId: bundle.catalogId, archiveId: bundle.archiveId, snapshotId: bundle.snapshotId, entries, statistics, schemaInventory }),
    canonical: true as const,
    appendOnlyCompatible: true as const,
  })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-v1',
    indexId: `${bundle.clusterId}:${bundle.generatedAt}:${bundle.integrity.digest}:${integrity.digest}`,
    clusterId: bundle.clusterId,
    generatedAt: bundle.generatedAt,
    bundleId: bundle.bundleId,
    manifestId: bundle.manifestId,
    registryId: bundle.registryId,
    catalogId: bundle.catalogId,
    archiveId: bundle.archiveId,
    snapshotId: bundle.snapshotId,
    entryCount: entries.length,
    entries: Object.freeze(entries),
    statistics,
    schemaInventory,
    integrity,
    retentionClass: bundle.retentionClass,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
