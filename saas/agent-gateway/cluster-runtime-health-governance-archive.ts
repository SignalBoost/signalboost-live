// saas/agent-gateway/cluster-runtime-health-governance-archive.ts
// Deterministic, immutable long-term archive for runtime health governance snapshots.

import type {
  ClusterRuntimeHealthGovernanceSnapshot,
  ClusterRuntimeHealthGovernanceSnapshotArtifact,
} from './cluster-runtime-health-governance-snapshot.ts'

export interface ClusterRuntimeHealthGovernanceArchiveItem {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-archive-item-v1'
  artifactId: string
  kind: ClusterRuntimeHealthGovernanceSnapshotArtifact['kind'] | 'governance-snapshot'
  schema: string
  generatedAt: string
  integrityDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceArchive {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-archive-v1'
  archiveId: string
  clusterId: string
  generatedAt: string
  snapshotId: string
  snapshotIntegrityDigest: string
  itemCount: number
  items: readonly ClusterRuntimeHealthGovernanceArchiveItem[]
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

export function createClusterRuntimeHealthGovernanceArchive(
  snapshot: ClusterRuntimeHealthGovernanceSnapshot,
): ClusterRuntimeHealthGovernanceArchive {
  if (!snapshot || snapshot.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-snapshot-v1') {
    throw new Error('invalid cluster runtime health governance archive snapshot')
  }
  if (
    snapshot.executable !== false ||
    snapshot.safety.readOnly !== true ||
    snapshot.safety.advisoryOnly !== true ||
    snapshot.safety.automaticRetryEnabled !== false ||
    snapshot.safety.automaticRepairEnabled !== false ||
    snapshot.safety.infrastructureMutationEnabled !== false
  ) {
    throw new Error('unsafe cluster runtime health governance archive snapshot')
  }
  if (!snapshot.snapshotId || !snapshot.clusterId || !snapshot.chainId || !Number.isFinite(Date.parse(snapshot.generatedAt))) {
    throw new Error('invalid cluster runtime health governance archive identity')
  }
  if (
    !/^[0-9a-f]{8}$/.test(snapshot.chainHeadDigest) ||
    !/^[0-9a-f]{8}$/.test(snapshot.cumulativeIntegrityDigest)
  ) {
    throw new Error('invalid cluster runtime health governance archive integrity')
  }
  if (snapshot.artifactCount !== snapshot.artifacts.length) {
    throw new Error('invalid cluster runtime health governance archive count')
  }

  const rawItems: ClusterRuntimeHealthGovernanceArchiveItem[] = snapshot.artifacts.map(artifact => {
    if (
      artifact.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-snapshot-artifact-v1' ||
      artifact.generatedAt !== snapshot.generatedAt ||
      artifact.readOnly !== true ||
      artifact.executable !== false ||
      artifact.retentionClass !== 'governance-evidence' ||
      !artifact.artifactId ||
      !artifact.schema ||
      !/^[0-9a-f]{8}$/.test(artifact.integrityDigest)
    ) {
      throw new Error('invalid cluster runtime health governance archive item')
    }

    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-archive-item-v1' as const,
      artifactId: artifact.artifactId,
      kind: artifact.kind,
      schema: artifact.schema,
      generatedAt: artifact.generatedAt,
      integrityDigest: artifact.integrityDigest,
      provenance: Object.freeze([...artifact.provenance, snapshot.snapshotId]),
      retentionClass: artifact.retentionClass,
      readOnly: true as const,
      executable: false as const,
    })
  })

  rawItems.push(Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-archive-item-v1',
    artifactId: snapshot.snapshotId,
    kind: 'governance-snapshot',
    schema: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    integrityDigest: snapshot.cumulativeIntegrityDigest,
    provenance: Object.freeze(['agent-gateway-runtime-health']),
    retentionClass: snapshot.retentionClass,
    readOnly: true,
    executable: false,
  }))

  const items = [...new Map(rawItems.map(item => [item.artifactId, item])).values()]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.artifactId.localeCompare(right.artifactId))
  const integrity = Object.freeze({
    algorithm: 'fnv1a-32' as const,
    digest: digest({ snapshotId: snapshot.snapshotId, snapshotIntegrityDigest: snapshot.cumulativeIntegrityDigest, items }),
    canonical: true as const,
    appendOnlyCompatible: true as const,
  })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-archive-v1',
    archiveId: `${snapshot.clusterId}:${snapshot.generatedAt}:${snapshot.cumulativeIntegrityDigest}:${integrity.digest}`,
    clusterId: snapshot.clusterId,
    generatedAt: snapshot.generatedAt,
    snapshotId: snapshot.snapshotId,
    snapshotIntegrityDigest: snapshot.cumulativeIntegrityDigest,
    itemCount: items.length,
    items: Object.freeze(items),
    integrity,
    retentionClass: snapshot.retentionClass,
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
