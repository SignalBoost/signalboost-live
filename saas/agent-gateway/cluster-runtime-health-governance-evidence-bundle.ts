// saas/agent-gateway/cluster-runtime-health-governance-evidence-bundle.ts
// Deterministic immutable evidence bundle for runtime health governance artifacts.

import type {
  ClusterRuntimeHealthGovernanceRegistryManifest,
  ClusterRuntimeHealthGovernanceRegistryManifestEntry,
} from './cluster-runtime-health-governance-registry-manifest.ts'

export interface ClusterRuntimeHealthGovernanceEvidenceBundleEntry {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-bundle-entry-v1'
  artifactId: string
  kind: ClusterRuntimeHealthGovernanceRegistryManifestEntry['kind'] | 'governance-registry-manifest'
  schema: string
  generatedAt: string
  integrityDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceEvidenceBundle {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-bundle-v1'
  bundleId: string
  clusterId: string
  generatedAt: string
  manifestId: string
  registryId: string
  catalogId: string
  archiveId: string
  snapshotId: string
  entryCount: number
  entries: readonly ClusterRuntimeHealthGovernanceEvidenceBundleEntry[]
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

export function createClusterRuntimeHealthGovernanceEvidenceBundle(
  manifest: ClusterRuntimeHealthGovernanceRegistryManifest,
): ClusterRuntimeHealthGovernanceEvidenceBundle {
  if (!manifest || manifest.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-registry-manifest-v1') {
    throw new Error('invalid cluster runtime health governance evidence bundle manifest')
  }
  if (
    manifest.executable !== false ||
    manifest.safety.readOnly !== true ||
    manifest.safety.advisoryOnly !== true ||
    manifest.safety.automaticRetryEnabled !== false ||
    manifest.safety.automaticRepairEnabled !== false ||
    manifest.safety.infrastructureMutationEnabled !== false
  ) {
    throw new Error('unsafe cluster runtime health governance evidence bundle manifest')
  }
  if (
    !manifest.manifestId || !manifest.registryId || !manifest.catalogId || !manifest.archiveId ||
    !manifest.snapshotId || !manifest.clusterId || !Number.isFinite(Date.parse(manifest.generatedAt))
  ) {
    throw new Error('invalid cluster runtime health governance evidence bundle identity')
  }
  if (
    manifest.integrity.algorithm !== 'fnv1a-32' || manifest.integrity.canonical !== true ||
    manifest.integrity.appendOnlyCompatible !== true || !/^[0-9a-f]{8}$/.test(manifest.integrity.digest)
  ) {
    throw new Error('invalid cluster runtime health governance evidence bundle integrity')
  }
  if (manifest.entryCount !== manifest.entries.length) {
    throw new Error('invalid cluster runtime health governance evidence bundle count')
  }

  const rawEntries: ClusterRuntimeHealthGovernanceEvidenceBundleEntry[] = manifest.entries.map(entry => {
    if (
      entry.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-registry-manifest-entry-v1' ||
      entry.generatedAt !== manifest.generatedAt || entry.readOnly !== true || entry.executable !== false ||
      entry.retentionClass !== 'governance-evidence' || !entry.artifactId || !entry.schema ||
      !/^[0-9a-f]{8}$/.test(entry.integrityDigest)
    ) {
      throw new Error('invalid cluster runtime health governance evidence bundle entry')
    }
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-bundle-entry-v1' as const,
      artifactId: entry.artifactId,
      kind: entry.kind,
      schema: entry.schema,
      generatedAt: entry.generatedAt,
      integrityDigest: entry.integrityDigest,
      provenance: Object.freeze([...entry.provenance, manifest.manifestId]),
      retentionClass: entry.retentionClass,
      readOnly: true as const,
      executable: false as const,
    })
  })

  rawEntries.push(Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-bundle-entry-v1',
    artifactId: manifest.manifestId,
    kind: 'governance-registry-manifest',
    schema: manifest.schemaVersion,
    generatedAt: manifest.generatedAt,
    integrityDigest: manifest.integrity.digest,
    provenance: Object.freeze(['agent-gateway-runtime-health']),
    retentionClass: manifest.retentionClass,
    readOnly: true,
    executable: false,
  }))

  const entries = [...new Map(rawEntries.map(entry => [entry.artifactId, entry])).values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.artifactId.localeCompare(right.artifactId))
  const statistics = sortedCounts(entries.map(entry => entry.kind))
  const schemaInventory = sortedCounts(entries.map(entry => entry.schema))
  const integrity = Object.freeze({
    algorithm: 'fnv1a-32' as const,
    digest: digest({ manifestId: manifest.manifestId, registryId: manifest.registryId, catalogId: manifest.catalogId, archiveId: manifest.archiveId, snapshotId: manifest.snapshotId, entries, statistics, schemaInventory }),
    canonical: true as const,
    appendOnlyCompatible: true as const,
  })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-bundle-v1',
    bundleId: `${manifest.clusterId}:${manifest.generatedAt}:${manifest.integrity.digest}:${integrity.digest}`,
    clusterId: manifest.clusterId,
    generatedAt: manifest.generatedAt,
    manifestId: manifest.manifestId,
    registryId: manifest.registryId,
    catalogId: manifest.catalogId,
    archiveId: manifest.archiveId,
    snapshotId: manifest.snapshotId,
    entryCount: entries.length,
    entries: Object.freeze(entries),
    statistics,
    schemaInventory,
    integrity,
    retentionClass: manifest.retentionClass,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
