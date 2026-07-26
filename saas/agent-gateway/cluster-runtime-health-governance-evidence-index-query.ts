// saas/agent-gateway/cluster-runtime-health-governance-evidence-index-query.ts
// Deterministic bounded read-only queries over governance evidence indexes.

import type {
  ClusterRuntimeHealthGovernanceEvidenceIndex,
  ClusterRuntimeHealthGovernanceEvidenceIndexEntry,
} from './cluster-runtime-health-governance-evidence-index.ts'

export interface ClusterRuntimeHealthGovernanceEvidenceIndexQuery {
  artifactIds?: readonly string[]
  kinds?: readonly ClusterRuntimeHealthGovernanceEvidenceIndexEntry['kind'][]
  schemas?: readonly string[]
  provenance?: readonly string[]
  limit?: number
  cursor?: string
}

export interface ClusterRuntimeHealthGovernanceEvidenceIndexQueryResult {
  schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-query-result-v1'
  queryId: string
  indexId: string
  clusterId: string
  generatedAt: string
  matchedCount: number
  returnedCount: number
  entries: readonly ClusterRuntimeHealthGovernanceEvidenceIndexEntry[]
  nextCursor: string | null
  integrity: Readonly<{ algorithm: 'fnv1a-32'; digest: string; canonical: true }>
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

function uniqueStrings(value: unknown, field: string): readonly string[] {
  if (value === undefined) return Object.freeze([])
  if (!Array.isArray(value) || value.length > 50 || value.some(item => typeof item !== 'string' || item.length === 0 || item.length > 256)) {
    throw new Error(`invalid cluster runtime health governance evidence index query ${field}`)
  }
  return Object.freeze([...new Set(value)].sort())
}

function validateIndex(index: ClusterRuntimeHealthGovernanceEvidenceIndex): void {
  if (!index || index.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-index-v1') throw new Error('invalid cluster runtime health governance evidence query index')
  if (!index.indexId || !index.clusterId || !index.bundleId || !Number.isFinite(Date.parse(index.generatedAt))) throw new Error('invalid cluster runtime health governance evidence query identity')
  if (index.entryCount !== index.entries.length) throw new Error('invalid cluster runtime health governance evidence query count')
  if (index.integrity.algorithm !== 'fnv1a-32' || index.integrity.canonical !== true || index.integrity.appendOnlyCompatible !== true || !/^[0-9a-f]{8}$/.test(index.integrity.digest)) throw new Error('invalid cluster runtime health governance evidence query integrity')
  if (index.executable !== false || index.safety.readOnly !== true || index.safety.advisoryOnly !== true || index.safety.automaticRetryEnabled !== false || index.safety.automaticRepairEnabled !== false || index.safety.infrastructureMutationEnabled !== false) throw new Error('unsafe cluster runtime health governance evidence query index')
  for (const entry of index.entries) {
    if (entry.schemaVersion !== 'agent-gateway-cluster-runtime-health-governance-evidence-index-entry-v1' || !entry.artifactId || !entry.schema || !Number.isFinite(Date.parse(entry.generatedAt)) || !/^[0-9a-f]{8}$/.test(entry.integrityDigest) || entry.retentionClass !== 'governance-evidence' || entry.readOnly !== true || entry.executable !== false || !Array.isArray(entry.provenance)) {
      throw new Error('invalid cluster runtime health governance evidence query entry')
    }
  }
}

export function queryClusterRuntimeHealthGovernanceEvidenceIndex(
  index: ClusterRuntimeHealthGovernanceEvidenceIndex,
  queryValue: unknown = {},
): ClusterRuntimeHealthGovernanceEvidenceIndexQueryResult {
  validateIndex(index)
  if (!queryValue || typeof queryValue !== 'object' || Array.isArray(queryValue)) throw new Error('invalid cluster runtime health governance evidence index query')
  const query = queryValue as Partial<ClusterRuntimeHealthGovernanceEvidenceIndexQuery>
  const artifactIds = uniqueStrings(query.artifactIds, 'artifactIds')
  const kinds = uniqueStrings(query.kinds, 'kinds')
  const schemas = uniqueStrings(query.schemas, 'schemas')
  const provenance = uniqueStrings(query.provenance, 'provenance')
  const limit = query.limit === undefined ? 50 : query.limit
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid cluster runtime health governance evidence index query limit')

  let offset = 0
  if (query.cursor !== undefined) {
    if (typeof query.cursor !== 'string') throw new Error('invalid cluster runtime health governance evidence index query cursor')
    const match = new RegExp(`^${index.integrity.digest}:(\\d+)$`).exec(query.cursor)
    if (!match) throw new Error('invalid cluster runtime health governance evidence index query cursor')
    offset = Number(match[1])
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid cluster runtime health governance evidence index query cursor')
  }

  const normalized = Object.freeze({ artifactIds, kinds, schemas, provenance, limit })
  const matches = index.entries.filter(entry =>
    (artifactIds.length === 0 || artifactIds.includes(entry.artifactId)) &&
    (kinds.length === 0 || kinds.includes(entry.kind)) &&
    (schemas.length === 0 || schemas.includes(entry.schema)) &&
    (provenance.length === 0 || provenance.every(value => entry.provenance.includes(value))),
  )
  if (offset > matches.length) throw new Error('invalid cluster runtime health governance evidence index query cursor range')
  const entries = Object.freeze(matches.slice(offset, offset + limit))
  const nextOffset = offset + entries.length
  const nextCursor = nextOffset < matches.length ? `${index.integrity.digest}:${nextOffset}` : null
  const integrity = Object.freeze({ algorithm: 'fnv1a-32' as const, digest: digest({ indexId: index.indexId, normalized, offset, entries, nextCursor }), canonical: true as const })

  return Object.freeze({
    schemaVersion: 'agent-gateway-cluster-runtime-health-governance-evidence-index-query-result-v1',
    queryId: `${index.indexId}:query:${integrity.digest}`,
    indexId: index.indexId,
    clusterId: index.clusterId,
    generatedAt: index.generatedAt,
    matchedCount: matches.length,
    returnedCount: entries.length,
    entries,
    nextCursor,
    integrity,
    safety: Object.freeze({ readOnly: true, advisoryOnly: true, automaticRetryEnabled: false, automaticRepairEnabled: false, infrastructureMutationEnabled: false }),
    executable: false,
  })
}
