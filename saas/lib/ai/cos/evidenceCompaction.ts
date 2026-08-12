import type { CosDelegationResult } from './connectorDelegation.ts'

export interface CosEvidenceSummaryItem {
  capabilityId: string
  ok: boolean
  providerId?: string
  summary: unknown
}

export interface CosEvidencePacket {
  mode: CosDelegationResult['mode']
  ok: boolean
  missingRequired: readonly string[]
  items: readonly CosEvidenceSummaryItem[]
}

const DEFAULT_MAX_STRING = 1200
const DEFAULT_MAX_ARRAY = 25
const DEFAULT_MAX_KEYS = 40

function compact(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.length > DEFAULT_MAX_STRING ? value.slice(0, DEFAULT_MAX_STRING) + '…' : value
  if (depth >= 4) return '[depth-limited]'
  if (Array.isArray(value)) return value.slice(0, DEFAULT_MAX_ARRAY).map(item => compact(item, depth + 1))
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .slice(0, DEFAULT_MAX_KEYS)
      .map(([key, item]) => [key, compact(item, depth + 1)]))
  }
  return String(value)
}

/**
 * Converts connector-native results into a bounded packet suitable for COS reasoning.
 * Raw provider payloads remain available through provenance/structured references;
 * COS receives the useful evidence without carrying unlimited logs or API responses.
 */
export function compactDelegatedEvidence(result: CosDelegationResult): CosEvidencePacket {
  return Object.freeze({
    mode: result.mode,
    ok: result.ok,
    missingRequired: Object.freeze([...result.missingRequired]),
    items: Object.freeze(result.evidence.map(({ capabilityId, result: execution }) => Object.freeze({
      capabilityId,
      ok: execution.ok,
      providerId: execution.providerId,
      summary: compact(execution.data),
    }))),
  })
}
