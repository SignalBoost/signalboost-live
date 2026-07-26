// saas/agent-gateway/cluster-runtime-health-governance-catalog.ts
// Deterministic, immutable canonical catalog for runtime health governance evidence.

import type {
  ClusterRuntimeHealthGovernanceArchive,
  ClusterRuntimeHealthGovernanceArchiveItem,
} from './cluster-runtime-health-governance-archive.ts'

export interface ClusterRuntimeHealthGovernanceCatalogEntry {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-catalog-entry-v1'
  artifactId: string
  kind: ClusterRuntimeHealthGovernanceArchiveItem['kind'] | 'governance-archive'
  schema: string
  generatedAt: string
  integrityDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceCatalog {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-catalog-v1'
  catalogId: string
  clusterId: string
  generatedAt: string
  archiveId: string
  snapshotId: string
  entryCount: number
  entries: readonly ClusterRuntimeHealthGovernanceCatalogEntry[]
  statistics: Readonly<Record<string, number>>
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

export function createClusterRuntimeHealthGovernanceCatalog(
  archive: ClusterRuntimeHealthGovernanceArchive,
): ClusterRuntimeHealthGovernanceCatalog {
  if (!archive || archive.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-archive-v1') {
    throw new Error('invalid cluster runtime health governance catalog archive')
  }
  if (
    archive.executable !== false ||
    archive.safety.readOnly !== true ||
    archive.safety.advisoryOnly !== true ||
    archive.safety.automaticRetryEnabled !== false ||
    archive.safety.automaticRepairEnabled !== false ||
    archive.safety.infrastructureMutationEnabled !== false
  ) {
    throw new Error('unsafe cluster runtime health governance catalog archive')
  }
  if (!archive.archiveId || !archive.snapshotId || !archive.clusterId || !Number.isFinite(Date.parse(archive.generatedAt))) {
    throw new Error('invalid cluster runtime health governance catalog identity')
  }
  if (
    archive.integrity.algorithm !== 'fnv1a-32' ||
    archive.integrity.canonical !== true ||
    archive.integrity.appendOnlyCompatible !== true ||
    !/^[0-9a-f]{8}$/.test(archive.integrity.digest) ||
    !/^[0-9a-f]{8}$/.test(archive.snapshotIntegrityDigest)
  ) {
    throw new Error('invalid cluster runtime health governance catalog integrity')
  }
  if (archive.itemCount !== archive.items.length) {
    throw new Error('invalid cluster runtime health governance catalog count')
  }

  const rawEntries: ClusterRuntimeHealthGovernanceCatalogEntry[] = archive.items.map(item => {
    if (
      item.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-archive-item-v1' ||
      item.generatedAt !== archive.generatedAt ||
      item.readOnly !== true ||
      item.executable !== false ||
      item.retentionClass !== 'governance-evidence' ||
      !item.artifactId ||
      !item.schema ||
      !/^[0-9a-f]{8}$/.test(item.integrityDigest)
    ) {
      throw new Error('invalid cluster runtime health governance catalog entry')
    }

    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-catalog-entry-v1' as const,
      artifactId: item.artifactId,
      kind: item.kind,
      schema: item.schema,
      generatedAt: item.generatedAt,
      integrityDigest: item.integrityDigest,
      provenance: Object.freeze([...item.provenance, archive.archiveId]),
      retentionClass: item.retentionClass,
      readOnly: true as const,
      executable: false as const,
    })
  })

  rawEntries.push(Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-catalog-entry-v1',
    artifactId: archive.archiveId,
    kind: 'governance-archive',
    schema: archive.schemaVersion,
    generatedAt: archive.generatedAt,
    integrityDigest: archive.integrity.digest,
    provenance: Object.freeze(['agent-gateway-runtime-health']),
    retentionClass: archive.retentionClass,
    readOnly: true,
    executable: false,
  }))

  const entries = [...new Map(rawEntries.map(entry => [entry.artifactId, entry])).values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.artifactId.localeCompare(right.artifactId))
  const statistics = Object.freeze(entries.reduce<Record<string, number>>((result, entry) => {
    result[entry.kind] = (result[entry.kind] ?? 0) + 1
    return result
  }, {}))
  const integrity = Object.freeze({
    algorithm: 'fnv1a-32' as const,
    digest: digest({ archiveId: archive.archiveId, snapshotId: archive.snapshotId, entries, statistics }),
    canonical: true as const,
    appendOnlyCompatible: true as const,
  })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-catalog-v1',
    catalogId: `${archive.clusterId}:${archive.generatedAt}:${archive.integrity.digest}:${integrity.digest}`,
    clusterId: archive.clusterId,
    generatedAt: archive.generatedAt,
    archiveId: archive.archiveId,
    snapshotId: archive.snapshotId,
    entryCount: entries.length,
    entries: Object.freeze(entries),
    statistics,
    integrity,
    retentionClass: archive.retentionClass,
    safety: Object.freeze({
      readOnly: true,
      advisoryOnly: true,
      automaticRetryEnabled: false,
      automaticRepairEnabled: false,
      infrastructureMutationEnabled: false,
    }),
    executable: false,
  })
}
