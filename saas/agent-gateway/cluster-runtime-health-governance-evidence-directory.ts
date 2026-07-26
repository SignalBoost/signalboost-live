// saas/agent-gateway/cluster-runtime-health-governance-evidence-directory.ts
// Deterministic immutable directory for runtime health governance evidence.

import type {
  ClusterRuntimeHealthGovernanceEvidenceIndex,
  ClusterRuntimeHealthGovernanceEvidenceIndexEntry,
} from './cluster-runtime-health-governance-evidence-index.ts'

export interface ClusterRuntimeHealthGovernanceEvidenceDirectoryEntry {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-directory-entry-v1'
  artifactId: string
  kind: ClusterRuntimeHealthGovernanceEvidenceIndexEntry['kind'] | 'governance-evidence-index'
  schema: string
  generatedAt: string
  integrityDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceEvidenceDirectory {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-directory-v1'
  directoryId: string
  clusterId: string
  generatedAt: string
  indexId: string
  bundleId: string
  manifestId: string
  registryId: string
  catalogId: string
  archiveId: string
  snapshotId: string
  entryCount: number
  entries: readonly ClusterRuntimeHealthGovernanceEvidenceDirectoryEntry[]
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

export function createClusterRuntimeHealthGovernanceEvidenceDirectory(
  index: ClusterRuntimeHealthGovernanceEvidenceIndex,
): ClusterRuntimeHealthGovernanceEvidenceDirectory {
  if (!index || index.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-index-v1') {
    throw new Error('invalid cluster runtime health governance evidence directory index')
  }
  if (
    index.executable !== false || index.safety.readOnly !== true || index.safety.advisoryOnly !== true ||
    index.safety.automaticRetryEnabled !== false || index.safety.automaticRepairEnabled !== false ||
    index.safety.infrastructureMutationEnabled !== false
  ) {
    throw new Error('unsafe cluster runtime health governance evidence directory index')
  }
  if (
    !index.indexId || !index.bundleId || !index.manifestId || !index.registryId || !index.catalogId ||
    !index.archiveId || !index.snapshotId || !index.clusterId || !Number.isFinite(Date.parse(index.generatedAt))
  ) {
    throw new Error('invalid cluster runtime health governance evidence directory identity')
  }
  if (
    index.integrity.algorithm !== 'fnv1a-32' || index.integrity.canonical !== true ||
    index.integrity.appendOnlyCompatible !== true || !/^[0-9a-f]{8}$/.test(index.integrity.digest)
  ) {
    throw new Error('invalid cluster runtime health governance evidence directory integrity')
  }
  if (index.entryCount !== index.entries.length) {
    throw new Error('invalid cluster runtime health governance evidence directory count')
  }

  const rawEntries: ClusterRuntimeHealthGovernanceEvidenceDirectoryEntry[] = index.entries.map(entry => {
    if (
      entry.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1' ||
      entry.generatedAt !== index.generatedAt || entry.readOnly !== true || entry.executable !== false ||
      entry.retentionClass !== 'governance-evidence' || !entry.artifactId || !entry.schema ||
      !/^[0-9a-f]{8}$/.test(entry.integrityDigest)
    ) {
      throw new Error('invalid cluster runtime health governance evidence directory entry')
    }
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-directory-entry-v1' as const,
      artifactId: entry.artifactId,
      kind: entry.kind,
      schema: entry.schema,
      generatedAt: entry.generatedAt,
      integrityDigest: entry.integrityDigest,
      provenance: Object.freeze([...entry.provenance, index.indexId]),
      retentionClass: entry.retentionClass,
      readOnly: true as const,
      executable: false as const,
    })
  })

  rawEntries.push(Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-directory-entry-v1',
    artifactId: index.indexId,
    kind: 'governance-evidence-index',
    schema: index.schemaVersion,
    generatedAt: index.generatedAt,
    integrityDigest: index.integrity.digest,
    provenance: Object.freeze(['agent-gateway-runtime-health']),
    retentionClass: index.retentionClass,
    readOnly: true,
    executable: false,
  }))

  const entries = [...new Map(rawEntries.map(entry => [entry.artifactId, entry])).values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.artifactId.localeCompare(right.artifactId))
  const statistics = sortedCounts(entries.map(entry => entry.kind))
  const schemaInventory = sortedCounts(entries.map(entry => entry.schema))
  const integrity = Object.freeze({
    algorithm: 'fnv1a-32' as const,
    digest: digest({ indexId: index.indexId, bundleId: index.bundleId, manifestId: index.manifestId, registryId: index.registryId, catalogId: index.catalogId, archiveId: index.archiveId, snapshotId: index.snapshotId, entries, statistics, schemaInventory }),
    canonical: true as const,
    appendOnlyCompatible: true as const,
  })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-directory-v1',
    directoryId: `${index.clusterId}:${index.generatedAt}:${index.integrity.digest}:${integrity.digest}`,
    clusterId: index.clusterId,
    generatedAt: index.generatedAt,
    indexId: index.indexId,
    bundleId: index.bundleId,
    manifestId: index.manifestId,
    registryId: index.registryId,
    catalogId: index.catalogId,
    archiveId: index.archiveId,
    snapshotId: index.snapshotId,
    entryCount: entries.length,
    entries: Object.freeze(entries),
    statistics,
    schemaInventory,
    integrity,
    retentionClass: index.retentionClass,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
