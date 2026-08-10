import { getAdminSupabase } from '@/utils/supabase/server'

export type CorpusLookupMetric = Readonly<{
  query: string
  canonicalDomain: string | null
  internalHit: boolean
  sufficient: boolean
  providerCalled: boolean
  providerId: string | null
  confidence: number
  latencyMs: number
  outcome: 'resolved' | 'not_found'
}>

export type CorpusMetricsSummary = Readonly<{
  lookups: number
  internalResolutions: number
  providerCalls: number
  internalResolutionRate: number
  providerAvoidanceRate: number
  averageConfidence: number
  averageLatencyMs: number
}>

export async function recordCorpusLookupMetric(metric: CorpusLookupMetric) {
  const admin = getAdminSupabase()
  const { error } = await admin.from('business_intelligence_corpus_metrics').insert({
    query_text: metric.query,
    canonical_domain: metric.canonicalDomain,
    internal_hit: metric.internalHit,
    sufficient: metric.sufficient,
    provider_called: metric.providerCalled,
    provider_id: metric.providerId,
    confidence: Math.max(0, Math.min(1, Number(metric.confidence) || 0)),
    latency_ms: Math.max(0, Math.trunc(Number(metric.latencyMs) || 0)),
    outcome: metric.outcome,
  })
  if (error) throw error
}

export function summarizeCorpusMetrics(rows: readonly Record<string, unknown>[]): CorpusMetricsSummary {
  const lookups = rows.length
  if (!lookups) return {
    lookups: 0,
    internalResolutions: 0,
    providerCalls: 0,
    internalResolutionRate: 0,
    providerAvoidanceRate: 0,
    averageConfidence: 0,
    averageLatencyMs: 0,
  }
  const internalResolutions = rows.filter(row => Boolean(row.internal_hit) && row.outcome === 'resolved').length
  const providerCalls = rows.filter(row => Boolean(row.provider_called)).length
  const averageConfidence = rows.reduce((sum, row) => sum + Math.max(0, Math.min(1, Number(row.confidence) || 0)), 0) / lookups
  const averageLatencyMs = rows.reduce((sum, row) => sum + Math.max(0, Number(row.latency_ms) || 0), 0) / lookups
  return {
    lookups,
    internalResolutions,
    providerCalls,
    internalResolutionRate: internalResolutions / lookups,
    providerAvoidanceRate: 1 - providerCalls / lookups,
    averageConfidence,
    averageLatencyMs,
  }
}

export async function getCorpusMetricsSummary(limit = 500): Promise<CorpusMetricsSummary> {
  const admin = getAdminSupabase()
  const bounded = Math.max(1, Math.min(5000, Math.trunc(limit)))
  const { data, error } = await admin
    .from('business_intelligence_corpus_metrics')
    .select('internal_hit,provider_called,confidence,latency_ms,outcome')
    .order('created_at', { ascending: false })
    .limit(bounded)
  if (error) throw error
  return summarizeCorpusMetrics(data ?? [])
}
