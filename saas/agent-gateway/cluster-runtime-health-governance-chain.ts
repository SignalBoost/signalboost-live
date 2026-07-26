// saas/agent-gateway/cluster-runtime-health-governance-chain.ts
// Deterministic, immutable append-only chain of custody for runtime health governance evidence.

import type { ClusterRuntimeHealthGovernanceLedger, ClusterRuntimeHealthGovernanceLedgerEntry } from './cluster-runtime-health-governance-ledger.ts'

export interface ClusterRuntimeHealthGovernanceChainLink {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-chain-link-v1'
  position: number
  artifactId: string
  kind: ClusterRuntimeHealthGovernanceLedgerEntry['kind'] | 'governance-ledger'
  schema: string
  generatedAt: string
  integrityDigest: string
  previousLinkDigest: string | null
  cumulativeDigest: string
  provenance: readonly string[]
  retentionClass: 'governance-evidence'
  readOnly: true
  executable: false
}

export interface ClusterRuntimeHealthGovernanceChain {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-chain-v1'
  chainId: string
  clusterId: string
  generatedAt: string
  artifactCount: number
  links: readonly ClusterRuntimeHealthGovernanceChainLink[]
  headDigest: string
  integrity: Readonly<{ algorithm: 'fnv1a-32'; digest: string; canonical: true; appendOnly: true }>
  retentionClass: 'governance-evidence'
  safety: Readonly<{ readOnly: true; advisoryOnly: true; automaticRetryEnabled: false; automaticRepairEnabled: false; infrastructureMutationEnabled: false }>
  executable: false
}

type RawLink = Pick<ClusterRuntimeHealthGovernanceChainLink, 'artifactId' | 'kind' | 'schema' | 'generatedAt' | 'integrityDigest' | 'provenance' | 'retentionClass'>

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

export function createClusterRuntimeHealthGovernanceChain(ledger: ClusterRuntimeHealthGovernanceLedger): ClusterRuntimeHealthGovernanceChain {
  if (!ledger || ledger.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-ledger-v1') throw new Error('invalid cluster runtime health governance chain ledger')
  if (ledger.executable !== false || ledger.safety.readOnly !== true || ledger.safety.advisoryOnly !== true || ledger.safety.infrastructureMutationEnabled !== false) throw new Error('unsafe cluster runtime health governance chain ledger')
  if (!ledger.clusterId || !Number.isFinite(Date.parse(ledger.generatedAt))) throw new Error('invalid cluster runtime health governance chain identity')
  if (ledger.integrity.algorithm !== 'fnv1a-32' || ledger.integrity.canonical !== true || ledger.integrity.chained !== true || !/^[0-9a-f]{8}$/.test(ledger.integrity.digest)) throw new Error('invalid cluster runtime health governance chain integrity')

  const raw: RawLink[] = ledger.entries.map((entry, expectedSequence) => {
    if (entry.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-ledger-entry-v1' || entry.sequence !== expectedSequence || entry.generatedAt !== ledger.generatedAt || entry.readOnly !== true || entry.executable !== false) throw new Error('invalid cluster runtime health governance chain entry')
    if (!/^[0-9a-f]{8}$/.test(entry.integrityDigest) || !/^[0-9a-f]{8}$/.test(entry.chainDigest)) throw new Error('invalid cluster runtime health governance chain entry integrity')
    if (expectedSequence === 0 ? entry.previousDigest !== null : entry.previousDigest !== ledger.entries[expectedSequence - 1]?.chainDigest) throw new Error('invalid cluster runtime health governance chain linkage')
    return {
      artifactId: entry.artifactId,
      kind: entry.kind,
      schema: entry.schema,
      generatedAt: entry.generatedAt,
      integrityDigest: entry.chainDigest,
      provenance: [...entry.provenance, ledger.ledgerId],
      retentionClass: entry.retentionClass,
    }
  })

  raw.push({
    artifactId: ledger.ledgerId,
    kind: 'governance-ledger',
    schema: ledger.schemaVersion,
    generatedAt: ledger.generatedAt,
    integrityDigest: ledger.integrity.digest,
    provenance: ['agent-gateway-runtime-health'],
    retentionClass: ledger.retentionClass,
  })

  const ordered = [...new Map(raw.map(link => [link.artifactId, link])).values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.artifactId.localeCompare(b.artifactId))
  let previousLinkDigest: string | null = null
  const links = ordered.map((link, position) => {
    const cumulativeDigest = digest({ position, previousLinkDigest, artifactId: link.artifactId, integrityDigest: link.integrityDigest })
    const result = Object.freeze({
      schemaVersion: 'agent-gateway-cluster-runtime-health-governance-chain-link-v1' as const,
      position,
      ...link,
      previousLinkDigest,
      cumulativeDigest,
      provenance: Object.freeze(link.provenance),
      readOnly: true as const,
      executable: false as const,
    })
    previousLinkDigest = cumulativeDigest
    return result
  })
  const headDigest = links.at(-1)?.cumulativeDigest ?? digest([])
  const integrity = Object.freeze({ algorithm: 'fnv1a-32' as const, digest: digest(links), canonical: true as const, appendOnly: true as const })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-chain-v1',
    chainId: `${ledger.clusterId}:${ledger.generatedAt}:${headDigest}:${integrity.digest}`,
    clusterId: ledger.clusterId,
    generatedAt: ledger.generatedAt,
    artifactCount: links.length,
    links: Object.freeze(links),
    headDigest,
    integrity,
    retentionClass: ledger.retentionClass,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
