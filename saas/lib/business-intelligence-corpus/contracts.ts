export type CorpusSourceType = 'curated' | 'enterprise_memory' | 'provider' | 'website' | 'registry' | 'learned'

export type BusinessIntelligenceRecord = Readonly<{
  id?: string
  canonicalDomain: string
  companyName: string
  aliases: readonly string[]
  industry?: string
  country?: string
  region?: string
  employeeCount?: number
  revenueUsd?: number
  website?: string
  description?: string
  technologies?: readonly string[]
  contacts?: readonly Readonly<{ name?: string; title?: string; email?: string }>[]
  attributes: Readonly<Record<string, unknown>>
  confidence: number
  sourceType: CorpusSourceType
  sourceIds: readonly string[]
  verifiedAt: string
  refreshedAt: string
  expiresAt: string
}>

export type CorpusLookup = Readonly<{
  query: string
  canonicalDomain?: string
  minConfidence?: number
  requireFresh?: boolean
}>

export type CorpusLookupResult = Readonly<{
  hit: boolean
  sufficient: boolean
  reason: 'not_found' | 'low_confidence' | 'stale' | 'internal_hit'
  record?: BusinessIntelligenceRecord
}>

export type CorpusEnrichmentResult = Readonly<{
  record: BusinessIntelligenceRecord
  source: 'internal' | 'provider'
  providerCalled: boolean
  providerId?: string
}>

export const CORPUS_TARGET_RECORDS = 5000
export const CORPUS_DEFAULT_MIN_CONFIDENCE = 0.78
export const CORPUS_DEFAULT_TTL_DAYS = 30

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function normalizeDomain(value: string): string {
  const raw = value.trim().toLowerCase()
  if (!raw) return ''
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return raw.replace(/^www\./, '').split('/')[0]
  }
}

export function isFresh(record: BusinessIntelligenceRecord, now = Date.now()): boolean {
  const expires = Date.parse(record.expiresAt)
  return Number.isFinite(expires) && expires > now
}
