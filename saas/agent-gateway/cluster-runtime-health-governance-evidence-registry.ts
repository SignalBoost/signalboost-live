// saas/agent-gateway/cluster-runtime-health-governance-evidence-registry.ts
// Deterministic immutable registry for runtime health governance evidence.

import type {
  ClusterRuntimeHealthGovernanceEvidenceCatalog,
  ClusterRuntimeHealthGovernanceEvidenceCatalogEntry,
} from './cluster-runtime-health-governance-evidence-catalog.ts'

export interface ClusterRuntimeHealthGovernanceEvidenceRegistryEntry {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-registry-entry-v1'
  artifactId: string
  kind: ClusterRuntimeHealthGovernanceEvidenceCatalogEntry['kind'] | 'governance-evidence-catalog'
  schema: string
  generatedAt: string
  integrityDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceEvidenceRegistry {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-registry-v1'
  evidenceRegistryId: string
  clusterId: string
  generatedAt: string
  evidenceCatalogId: string
  directoryId: string
  indexId: string
  bundleId: string
  manifestId: string
  registryId: string
  catalogId: string
  archiveId: string
  snapshotId: string
  entryCount: number
  entries: readonly ClusterRuntimeHealthGovernanceEvidenceRegistryEntry[]
  statistics: Readonly<Record<string, number>>
  schemaInventory: Readonly<Record<string, number>>
  integrity: Readonly<{ algorithm: 'fnv1a-32'; digest: string; canonical: true; appendOnlyCompatible: true }>
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

function sortedCounts(values: readonly string[]): Readonly<Record<string, number>> {
  const counts = values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1
    return result
  }, {})
  return Object.freeze(Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))))
}

export function createClusterRuntimeHealthGovernanceEvidenceRegistry(
  catalog: ClusterRuntimeHealthGovernanceEvidenceCatalog,
): ClusterRuntimeHealthGovernanceEvidenceRegistry {
  if (!catalog || catalog.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-v1') {
    throw new Error('invalid cluster runtime health governance evidence registry catalog')
  }
  if (
    catalog.executable !== false || catalog.safety.readOnly !== true || catalog.safety.advisoryOnly !== true ||
    catalog.safety.automaticRetryEnabled !== false || catalog.safety.automaticRepairEnabled !== false ||
    catalog.safety.infrastructureMutationEnabled !== false
  ) throw new Error('unsafe cluster runtime health governance evidence registry catalog')
  if (
    !catalog.evidenceCatalogId || !catalog.directoryId || !catalog.indexId || !catalog.bundleId || !catalog.manifestId ||
    !catalog.registryId || !catalog.catalogId || !catalog.archiveId || !catalog.snapshotId || !catalog.clusterId ||
    !Number.isFinite(Date.parse(catalog.generatedAt))
  ) throw new Error('invalid cluster runtime health governance evidence registry identity')
  if (
    catalog.integrity.algorithm !== 'fnv1a-32' || catalog.integrity.canonical !== true ||
    catalog.integrity.appendOnlyCompatible !== true || !/^[0-9a-f]{8}$/.test(catalog.integrity.digest)
  ) throw new Error('invalid cluster runtime health governance evidence registry integrity')
  if (catalog.entryCount !== catalog.entries.length) throw new Error('invalid cluster runtime health governance evidence registry count')

  const rawEntries: ClusterRuntimeHealthGovernanceEvidenceRegistryEntry[] = catalog.entries.map(entry => {
    if (
      entry.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-catalog-entry-v1' ||
      entry.generatedAt !== catalog.generatedAt || entry.readOnly !== true || entry.executable !== false ||
      entry.retentionClass !== 'governance-evidence' || !entry.artifactId || !entry.schema ||
      !/^[0-9a-f]{8}$/.test(entry.integrityDigest)
    ) throw new Error('invalid cluster runtime health governance evidence registry entry')
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-registry-entry-v1' as const,
      artifactId: entry.artifactId,
      kind: entry.kind,
      schema: entry.schema,
      generatedAt: entry.generatedAt,
      integrityDigest: entry.integrityDigest,
      provenance: Object.freeze([...entry.provenance, catalog.evidenceCatalogId]),
      retentionClass: entry.retentionClass,
      readOnly: true as const,
      executable: false as const,
    })
  })
  rawEntries.push(Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-registry-entry-v1',
    artifactId: catalog.evidenceCatalogId,
    kind: 'governance-evidence-catalog',
    schema: catalog.schemaVersion,
    generatedAt: catalog.generatedAt,
    integrityDigest: catalog.integrity.digest,
    provenance: Object.freeze(['agent-gateway-runtime-health']),
    retentionClass: catalog.retentionClass,
    readOnly: true,
    executable: false,
  }))

  const entries = [...new Map(rawEntries.map(entry => [entry.artifactId, entry])).values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.artifactId.localeCompare(right.artifactId))
  const statistics = sortedCounts(entries.map(entry => entry.kind))
  const schemaInventory = sortedCounts(entries.map(entry => entry.schema))
  const integrity = Object.freeze({
    algorithm: 'fnv1a-32' as const,
    digest: digest({ evidenceCatalogId: catalog.evidenceCatalogId, directoryId: catalog.directoryId, indexId: catalog.indexId, bundleId: catalog.bundleId, manifestId: catalog.manifestId, registryId: catalog.registryId, catalogId: catalog.catalogId, archiveId: catalog.archiveId, snapshotId: catalog.snapshotId, entries, statistics, schemaInventory }),
    canonical: true as const,
    appendOnlyCompatible: true as const,
  })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-registry-v1',
    evidenceRegistryId: `${catalog.clusterId}:${catalog.generatedAt}:${catalog.integrity.digest}:${integrity.digest}`,
    clusterId: catalog.clusterId,
    generatedAt: catalog.generatedAt,
    evidenceCatalogId: catalog.evidenceCatalogId,
    directoryId: catalog.directoryId,
    indexId: catalog.indexId,
    bundleId: catalog.bundleId,
    manifestId: catalog.manifestId,
    registryId: catalog.registryId,
    catalogId: catalog.catalogId,
    archiveId: catalog.archiveId,
    snapshotId: catalog.snapshotId,
    entryCount: entries.length,
    entries: Object.freeze(entries),
    statistics,
    schemaInventory,
    integrity,
    retentionClass: catalog.retentionClass,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
