// saas/lib/ai/cos/cosUniversityHoldoutGainSignificance.ts
//
// Holdout gain must be real, not noise (owner go, 2026-10-06).
//
// Production evidence, capability gain trace 2026-10-06 (latest exam per exact artifact, 7 days): n=607, mean
// trained-minus-baseline holdout gain -0.0057 +/- 0.0096, improved 176 / unchanged 248 / regressed 183, sign test
// z=-0.37. Training had no measurable effect, yet 105 artifacts graduated in the same window, because the holdout
// gate was `candidate mean > baseline mean` on 6 cases scored 0, 0.5 or 1. One case moves that mean by ~0.08-0.17,
// so "beat the baseline" was close to a coin flip. ONBOARD: "Graduation is not the product. Trustworthy selection is
// the product." A gate that a no-effect artifact passes by chance is not selection.
//
// This module decides whether the paired per-case gain on the holdout is distinguishable from chance. It uses the
// exact one-sided paired sign-flip (permutation) test on the per-case differences candidate - baseline: under "the
// training did nothing", each nonzero difference is equally likely to have either sign, so the p-value is the exact
// probability, over all 2^m sign assignments of the m nonzero differences, of a summed gain at least as large as
// the observed one. Ties contribute nothing. No distributional assumption, no normal approximation, exact at any
// holdout size, and computed by dynamic programming over the summed gain (not by enumerating 2^m assignments).
//
// It only ever REMOVES passes: significant implies a strictly positive summed gain, which is exactly
// `candidate mean > baseline mean` on the same cases. Every artifact this gate passes, the previous gate passed.
// It changes no other suite, threshold, admission rule, call ceiling or spend.
//
// Consequence of the current 6-case mass holdout, stated so nobody mistakes it for a defect: the smallest attainable
// p-value is 1/64, so an artifact clears alpha=0.05 only when nearly every holdout case improves and none of
// comparable size regresses. A larger holdout makes smaller real gains detectable; that is a separate change
// (worker partition, evaluator call ceiling, spend) and is not made here.
export const HOLDOUT_GAIN_SIGNIFICANCE_PROFILE = 'cos-university-holdout-gain-significance-v1' as const
export const HOLDOUT_GAIN_SIGNIFICANCE_METHOD = 'exact_paired_sign_flip_one_sided' as const
/** Conventional one-sided significance level. A fixed standard, not a tuning knob. */
export const HOLDOUT_GAIN_ALPHA = 0.05

/** Scores are compared on a 1e-4 grid, the precision the case-score table stores (numeric(5,4)). */
const UNITS_PER_POINT = 10_000
/** Float tolerance for the p <= alpha comparison; far below the 1/2^m resolution of any real holdout. */
const P_VALUE_EPSILON = 1e-12

export type HoldoutGainCase = Readonly<{ baseline: number; candidate: number }>

export type HoldoutGainAssessment = Readonly<{
  profile: typeof HOLDOUT_GAIN_SIGNIFICANCE_PROFILE
  method: typeof HOLDOUT_GAIN_SIGNIFICANCE_METHOD
  alpha: number
  pairedCases: number
  improvedCases: number
  regressedCases: number
  tiedCases: number
  /** candidate mean minus baseline mean over the same cases. */
  meanGain: number
  /** Exact one-sided p-value: P(summed gain >= observed | each nonzero difference's sign is a fair coin). */
  pValue: number
  /** True only when the summed gain is positive AND pValue <= alpha. */
  significant: boolean
}>

function units(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('holdout_gain_score_invalid')
  }
  return Math.round(value * UNITS_PER_POINT)
}

/** Exact upper-tail probability of the sign-flip null for integer magnitudes. */
export function signFlipUpperTailPValue(magnitudes: readonly number[], observedSum: number): number {
  const total = magnitudes.reduce((sum, value) => sum + value, 0)
  if (!magnitudes.length) return 1
  // Index i represents a summed gain of (i - total). Every assignment has probability 1/2^m.
  let distribution = new Float64Array(2 * total + 1)
  distribution[total] = 1
  for (const magnitude of magnitudes) {
    const next = new Float64Array(2 * total + 1)
    for (let index = 0; index < distribution.length; index += 1) {
      const probability = distribution[index]
      if (!probability) continue
      next[index + magnitude] += probability / 2
      next[index - magnitude] += probability / 2
    }
    distribution = next
  }
  let tail = 0
  for (let index = Math.max(0, observedSum + total); index < distribution.length; index += 1) tail += distribution[index]
  return Math.min(1, tail)
}

function gcd(a: number, b: number): number {
  let x = a
  let y = b
  while (y) [x, y] = [y, x % y]
  return x
}

export function assessHoldoutGain(scored: readonly HoldoutGainCase[]): HoldoutGainAssessment {
  if (!Array.isArray(scored) || scored.length === 0) throw new Error('holdout_gain_cases_missing')
  const differences = scored.map(item => units(item.candidate) - units(item.baseline))
  const nonzero = differences.filter(difference => difference !== 0)
  const observedSum = differences.reduce((sum, difference) => sum + difference, 0)
  // Divide by the common divisor first: the tail probability is unchanged and the judge's 0 / 0.5 / 1 grid collapses
  // the distribution from ~120,000 cells per case to a handful.
  const divisor = nonzero.reduce((acc, difference) => gcd(acc, Math.abs(difference)), 0) || 1
  const pValue = signFlipUpperTailPValue(nonzero.map(difference => Math.abs(difference) / divisor), Math.ceil(observedSum / divisor))
  return Object.freeze({
    profile: HOLDOUT_GAIN_SIGNIFICANCE_PROFILE,
    method: HOLDOUT_GAIN_SIGNIFICANCE_METHOD,
    alpha: HOLDOUT_GAIN_ALPHA,
    pairedCases: differences.length,
    improvedCases: differences.filter(difference => difference > 0).length,
    regressedCases: differences.filter(difference => difference < 0).length,
    tiedCases: differences.length - nonzero.length,
    meanGain: observedSum / UNITS_PER_POINT / differences.length,
    pValue,
    significant: observedSum > 0 && pValue <= HOLDOUT_GAIN_ALPHA + P_VALUE_EPSILON,
  })
}

/**
 * Reads a recorded assessment back from evaluation evidence (the completed-exam event's `holdout.significance`).
 * Returns true only for an assessment produced by this profile that says significant with a consistent p-value;
 * an absent or foreign record is never treated as significant.
 */
export function recordedHoldoutGainIsSignificant(holdout: unknown): boolean {
  const significance = holdout && typeof holdout === 'object'
    ? (holdout as Record<string, unknown>).significance
    : null
  if (!significance || typeof significance !== 'object') return false
  const record = significance as Record<string, unknown>
  const pValue = Number(record.pValue)
  const alpha = Number(record.alpha)
  return record.profile === HOLDOUT_GAIN_SIGNIFICANCE_PROFILE
    && record.significant === true
    && alpha === HOLDOUT_GAIN_ALPHA
    && Number.isFinite(pValue)
    && pValue <= HOLDOUT_GAIN_ALPHA + P_VALUE_EPSILON
    && Number(record.meanGain) > 0
}
