// Business Intelligence Corpus policy.
// Keeps commercial providers behind an explicit confidence/freshness gate so
// COS can reuse internal knowledge before spending provider or model credits.

export type CorpusSource = 'curated_file' | 'enterprise_memory' | 'knowledge_graph' | 'external_provider'

export type CorpusEvidence = Readonly<{
  source: CorpusSource
  confidence?: number
  completeness?: number
  verifiedAt?: string | null
}>

export type CorpusDecision = Readonly<{
  confidence: number
  fresh: boolean
  sufficient: boolean
  enrichExternally: boolean
  reasons: readonly string[]
}>

const DEFAULT_CONFIDENCE_THRESHOLD = 0.78
const DEFAULT_MAX_AGE_DAYS = 30

function unit(value: number | undefined) {
  if (!Number.isFinite(value)) return 0
  const numeric = Number(value)
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric))
}

function freshness(verifiedAt: string | null | undefined, maxAgeDays: number) {
  if (!verifiedAt) return false
  const verified = Date.parse(verifiedAt)
  if (!Number.isFinite(verified)) return false
  return Date.now() - verified <= maxAgeDays * 86_400_000
}

export function evaluateCorpusEvidence(
  evidence: readonly CorpusEvidence[],
  options: { confidenceThreshold?: number; maxAgeDays?: number } = {},
): CorpusDecision {
  const threshold = unit(options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD)
  const maxAgeDays = Math.max(1, options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS)
  const internal = evidence.filter(item => item.source !== 'external_provider')
  const confidence = internal.reduce((best, item) => {
    const score = unit(item.confidence) * 0.7 + unit(item.completeness) * 0.3
    return Math.max(best, score)
  }, 0)
  const fresh = internal.some(item => freshness(item.verifiedAt, maxAgeDays))
  const reasons: string[] = []
  if (!internal.length) reasons.push('NO_INTERNAL_EVIDENCE')
  if (confidence < threshold) reasons.push('INTERNAL_CONFIDENCE_INSUFFICIENT')
  if (!fresh) reasons.push('INTERNAL_EVIDENCE_STALE')
  const sufficient = internal.length > 0 && confidence >= threshold && fresh
  return { confidence, fresh, sufficient, enrichExternally: !sufficient, reasons }
}

export function shouldUseExternalProvider(evidence: readonly CorpusEvidence[], options?: {
  confidenceThreshold?: number
  maxAgeDays?: number
}) {
  return evaluateCorpusEvidence(evidence, options).enrichExternally
}
