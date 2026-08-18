export type AdmissionTier = 'high_confidence' | 'probationary' | 'rejected'
export const PROBATIONARY_MINIMUM_CONFIDENCE = 0.65

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback
}

/**
 * Tier thresholds, env-tunable. The probationary RELEVANCE default is 0.35, not the 0.70 the
 * original schema proposed — and that is a calibration to the metric, not a loosening of intent.
 * `rawRelevance` here is score.coverage: a weighted term-match ratio whose admission floor is 0.12
 * and where even durable-accepted full-text documents routinely sit far below 0.70 (the confidence
 * formula admits full text at coverage ~0). Production run cb84fe69 (2026-08-18) classified 41
 * borderline candidates against the 0.70 bar and ZERO reached probationary — the bar was
 * transplanted from a spec that assumed a differently-scaled relevance score, so it selected
 * nothing rather than selecting strictly. Quality control for this tier comes from the confidence
 * floor plus the corroboration requirement, and probationary rows stay invisible to retrieval until
 * promoted.
 */
export function tierThresholds() {
  return {
    highRelevance: envNumber('COS_TIER_HIGH_RELEVANCE', 0.85),
    highConfidence: envNumber('COS_TIER_HIGH_CONFIDENCE', 0.8),
    highSourceFloor: envNumber('COS_TIER_HIGH_SOURCE_FLOOR', 0.75),
    probationaryRelevance: envNumber('COS_TIER_PROBATIONARY_RELEVANCE', 0.35),
    probationaryConfidence: envNumber('COS_TIER_PROBATIONARY_CONFIDENCE', PROBATIONARY_MINIMUM_CONFIDENCE),
    probationarySourceFloor: envNumber('COS_TIER_PROBATIONARY_SOURCE_FLOOR', 0.6),
  }
}

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

  const thresholds = tierThresholds()
  if (rawRelevance >= thresholds.highRelevance && confidence >= thresholds.highConfidence && sourceFloor >= thresholds.highSourceFloor) {
    return { tier: 'high_confidence', rawRelevance, gapAdjustedRelevance, confidence, sourceFloor, gapAligned, corroborationRequired: false, reason: 'high_confidence' }
  }
  if (gapAdjustedRelevance >= thresholds.probationaryRelevance && confidence >= thresholds.probationaryConfidence && sourceFloor >= thresholds.probationarySourceFloor) {
    return { tier: 'probationary', rawRelevance, gapAdjustedRelevance, confidence, sourceFloor, gapAligned, corroborationRequired: !gapAligned, reason: gapAligned ? 'gap_aligned_probationary' : 'corroboration_required' }
  }
  return { tier: 'rejected', rawRelevance, gapAdjustedRelevance, confidence, sourceFloor, gapAligned, corroborationRequired: false, reason: 'tier_threshold_not_met' }
}
