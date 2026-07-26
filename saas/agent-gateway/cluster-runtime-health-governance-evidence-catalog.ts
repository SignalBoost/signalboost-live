// saas/agent-gateway/cluster-runtime-health-governance-evidence-catalog.ts
// Deterministic immutable catalog for runtime health governance evidence.

import type {
  ClusterRuntimeHealthGovernanceEvidenceDirectory,
  ClusterRuntimeHealthGovernanceEvidenceDirectoryEntry,
} from './cluster-runtime-health-governance-evidence-directory.ts'

export interface ClusterRuntimeHealthGovernanceEvidenceCatalogEntry {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-entry-v1'
  artifactId: string
  kind: ClusterRuntimeHealthGovernanceEvidenceDirectoryEntry['kind'] | 'governance-evidence-directory'
  schema: string
  generatedAt: string
  integrityDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceEvidenceCatalog {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-v1'
  evidenceCatalogId: string
  clusterId: string
  generatedAt: string
  directoryId: string
  indexId: string
  bundleId: string
  manifestId: string
  registryId: string
  catalogId: string
  archiveId: string
  snapshotId: string
  entryCount: number
  entries: readonly ClusterRuntimeHealthGovernanceEvidenceCatalogEntry[]
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

export function createClusterRuntimeHealthGovernanceEvidenceCatalog(
  directory: ClusterRuntimeHealthGovernanceEvidenceDirectory,
): ClusterRuntimeHealthGovernanceEvidenceCatalog {
  if (!directory || directory.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-directory-v1') {
    throw new Error('invalid cluster runtime health governance evidence catalog directory')
  }
  if (
    directory.executable !== false || directory.safety.readOnly !== true || directory.safety.advisoryOnly !== true ||
    directory.safety.automaticRetryEnabled !== false || directory.safety.automaticRepairEnabled !== false ||
    directory.safety.infrastructureMutationEnabled !== false
  ) {
    throw new Error('unsafe cluster runtime health governance evidence catalog directory')
  }
  if (
    !directory.directoryId || !directory.indexId || !directory.bundleId || !directory.manifestId ||
    !directory.registryId || !directory.catalogId || !directory.archiveId || !directory.snapshotId ||
    !directory.clusterId || !Number.isFinite(Date.parse(directory.generatedAt))
  ) {
    throw new Error('invalid cluster runtime health governance evidence catalog identity')
  }
  if (
    directory.integrity.algorithm !== 'fnv1a-32' || directory.integrity.canonical !== true ||
    directory.integrity.appendOnlyCompatible !== true || !/^[0-9a-f]{8}$/.test(directory.integrity.digest)
  ) {
    throw new Error('invalid cluster runtime health governance evidence catalog integrity')
  }
  if (directory.entryCount !== directory.entries.length) {
    throw new Error('invalid cluster runtime health governance evidence catalog count')
  }

  const rawEntries: ClusterRuntimeHealthGovernanceEvidenceCatalogEntry[] = directory.entries.map(entry => {
    if (
      entry.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-directory-entry-v1' ||
      entry.generatedAt !== directory.generatedAt || entry.readOnly !== true || entry.executable !== false ||
      entry.retentionClass !== 'governance-evidence' || !entry.artifactId || !entry.schema ||
      !/^[0-9a-f]{8}$/.test(entry.integrityDigest)
    ) {
      throw new Error('invalid cluster runtime health governance evidence catalog entry')
    }
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-entry-v1' as const,
      artifactId: entry.artifactId,
      kind: entry.kind,
      schema: entry.schema,
      generatedAt: entry.generatedAt,
      integrityDigest: entry.integrityDigest,
      provenance: Object.freeze([...entry.provenance, directory.directoryId]),
      retentionClass: entry.retentionClass,
      readOnly: true as const,
      executable: false as const,
    })
  })

  rawEntries.push(Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-entry-v1',
    artifactId: directory.directoryId,
    kind: 'governance-evidence-directory',
    schema: directory.schemaVersion,
    generatedAt: directory.generatedAt,
    integrityDigest: directory.integrity.digest,
    provenance: Object.freeze(['agent-gateway-runtime-health']),
    retentionClass: directory.retentionClass,
    readOnly: true,
    executable: false,
  }))

  const entries = [...new Map(rawEntries.map(entry => [entry.artifactId, entry])).values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.artifactId.localeCompare(right.artifactId))
  const statistics = sortedCounts(entries.map(entry => entry.kind))
  const schemaInventory = sortedCounts(entries.map(entry => entry.schema))
  const integrity = Object.freeze({
    algorithm: 'fnv1a-32' as const,
    digest: digest({ directoryId: directory.directoryId, indexId: directory.indexId, bundleId: directory.bundleId, manifestId: directory.manifestId, registryId: directory.registryId, catalogId: directory.catalogId, archiveId: directory.archiveId, snapshotId: directory.snapshotId, entries, statistics, schemaInventory }),
    canonical: true as const,
    appendOnlyCompatible: true as const,
  })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-v1',
    evidenceCatalogId: `${directory.clusterId}:${directory.generatedAt}:${directory.integrity.digest}:${integrity.digest}`,
    clusterId: directory.clusterId,
    generatedAt: directory.generatedAt,
    directoryId: directory.directoryId,
    indexId: directory.indexId,
    bundleId: directory.bundleId,
    manifestId: directory.manifestId,
    registryId: directory.registryId,
    catalogId: directory.catalogId,
    archiveId: directory.archiveId,
    snapshotId: directory.snapshotId,
    entryCount: entries.length,
    entries: Object.freeze(entries),
    statistics,
    schemaInventory,
    integrity,
    retentionClass: directory.retentionClass,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
