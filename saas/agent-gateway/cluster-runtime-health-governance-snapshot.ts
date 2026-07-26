// saas/agent-gateway/cluster-runtime-health-governance-snapshot.ts
// Deterministic, immutable point-in-time snapshot of runtime health governance evidence.

import type { ClusterRuntimeHealthGovernanceChain, ClusterRuntimeHealthGovernanceChainLink } from './cluster-runtime-health-governance-chain.ts'

export interface ClusterRuntimeHealthGovernanceSnapshotArtifact {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-snapshot-artifact-v1'
  artifactId: string
  kind: ClusterRuntimeHealthGovernanceChainLink['kind'] | 'governance-chain'
  schema: string
  generatedAt: string
  integrityDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceSnapshot {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-snapshot-v1'
  snapshotId: string
  clusterId: string
  generatedAt: string
  chainId: string
  chainHeadDigest: string
  artifactCount: number
  artifacts: readonly ClusterRuntimeHealthGovernanceSnapshotArtifact[]
  cumulativeIntegrityDigest: string
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

export function createClusterRuntimeHealthGovernanceSnapshot(chain: ClusterRuntimeHealthGovernanceChain): ClusterRuntimeHealthGovernanceSnapshot {
  if (!chain || chain.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-chain-v1') throw new Error('invalid cluster runtime health governance snapshot chain')
  if (chain.executable !== false || chain.safety.readOnly !== true || chain.safety.advisoryOnly !== true || chain.safety.infrastructureMutationEnabled !== false) throw new Error('unsafe cluster runtime health governance snapshot chain')
  if (!chain.clusterId || !Number.isFinite(Date.parse(chain.generatedAt))) throw new Error('invalid cluster runtime health governance snapshot identity')
  if (chain.integrity.algorithm !== 'fnv1a-32' || chain.integrity.canonical !== true || chain.integrity.appendOnly !== true || !/^[0-9a-f]{8}$/.test(chain.integrity.digest) || !/^[0-9a-f]{8}$/.test(chain.headDigest)) throw new Error('invalid cluster runtime health governance snapshot integrity')
  if (chain.artifactCount !== chain.links.length) throw new Error('invalid cluster runtime health governance snapshot count')

  const raw: ClusterRuntimeHealthGovernanceSnapshotArtifact[] = chain.links.map((link, expectedPosition) => {
    if (link.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-chain-link-v1' || link.position !== expectedPosition || link.generatedAt !== chain.generatedAt || link.readOnly !== true || link.executable !== false) throw new Error('invalid cluster runtime health governance snapshot link')
    if (!/^[0-9a-f]{8}$/.test(link.integrityDigest) || !/^[0-9a-f]{8}$/.test(link.cumulativeDigest)) throw new Error('invalid cluster runtime health governance snapshot link integrity')
    if (expectedPosition === 0 ? link.previousLinkDigest !== null : link.previousLinkDigest !== chain.links[expectedPosition - 1]?.cumulativeDigest) throw new Error('invalid cluster runtime health governance snapshot linkage')
    return Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-snapshot-artifact-v1' as const,
      artifactId: link.artifactId,
      kind: link.kind,
      schema: link.schema,
      generatedAt: link.generatedAt,
      integrityDigest: link.cumulativeDigest,
      provenance: Object.freeze([...link.provenance, chain.chainId]),
      retentionClass: link.retentionClass,
      readOnly: true as const,
      executable: false as const,
    })
  })

  raw.push(Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-snapshot-artifact-v1',
    artifactId: chain.chainId,
    kind: 'governance-chain',
    schema: chain.schemaVersion,
    generatedAt: chain.generatedAt,
    integrityDigest: chain.integrity.digest,
    provenance: Object.freeze(['agent-gateway-runtime-health']),
    retentionClass: chain.retentionClass,
    readOnly: true,
    executable: false,
  }))

  const artifacts = [...new Map(raw.map(artifact => [artifact.artifactId, artifact])).values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.artifactId.localeCompare(b.artifactId))
  const cumulativeIntegrityDigest = digest({ chainId: chain.chainId, chainHeadDigest: chain.headDigest, artifacts })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-snapshot-v1',
    snapshotId: `${chain.clusterId}:${chain.generatedAt}:${chain.headDigest}:${cumulativeIntegrityDigest}`,
    clusterId: chain.clusterId,
    generatedAt: chain.generatedAt,
    chainId: chain.chainId,
    chainHeadDigest: chain.headDigest,
    artifactCount: artifacts.length,
    artifacts: Object.freeze(artifacts),
    cumulativeIntegrityDigest,
    retentionClass: chain.retentionClass,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
