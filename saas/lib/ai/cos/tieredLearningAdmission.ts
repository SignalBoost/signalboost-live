export type AdmissionTier = 'high_confidence' | 'probationary' | 'rejected'

export type TieredAdmission = {
  tier: AdmissionTier
  rawRelevance: number
  gapAdjustedRelevance: number
  confidence: number
  sourceFloor: number
  gapAligned: boolean
  corroborationRequired: boolean
  reason: string
}

const clamp = (value: number) => Number(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)).toFixed(4))

/**
 * Classifies evidence without modifying its measured relevance or confidence.
 * Gap alignment is a transparent routing signal, never a fabricated quality score.
 */
export function classifyTieredAdmission(input: {
  rawRelevance: number
  confidence: number
  sourceFloor: number
  gapAligned: boolean
}): TieredAdmission {
  const rawRelevance = clamp(input.rawRelevance)
  const confidence = clamp(input.confidence)
  const sourceFloor = clamp(input.sourceFloor)
  const gapAligned = Boolean(input.gapAligned)
  const gapAdjustedRelevance = clamp(rawRelevance + (gapAligned ? 0.1 : 0))

  if (rawRelevance >= 0.85 && confidence >= 0.8 && sourceFloor >= 0.75) {
    return { tier: 'high_confidence', rawRelevance, gapAdjustedRelevance, confidence, sourceFloor, gapAligned, corroborationRequired: false, reason: 'high_confidence' }
  }
  if (gapAdjustedRelevance >= 0.7 && confidence >= 0.65 && sourceFloor >= 0.6) {
    return { tier: 'probationary', rawRelevance, gapAdjustedRelevance, confidence, sourceFloor, gapAligned, corroborationRequired: !gapAligned, reason: gapAligned ? 'gap_aligned_probationary' : 'corroboration_required' }
  }
  return { tier: 'rejected', rawRelevance, gapAdjustedRelevance, confidence, sourceFloor, gapAligned, corroborationRequired: false, reason: 'tier_threshold_not_met' }
}
