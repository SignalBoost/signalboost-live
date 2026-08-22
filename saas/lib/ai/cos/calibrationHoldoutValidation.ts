// saas/lib/ai/cos/calibrationHoldoutValidation.ts
//
// THE MISSING HALF OF CALIBRATION LEARNING: held-out validation.
//
// The existing calibration core (answerConfidenceCalibration.ts) measures how far claimed
// confidence sits from delivered success and reports it by cohort — observation. ONBOARD's
// calibration spec requires the second half before anything may even be RECOMMENDED: fit a
// calibration on one cohort and prove on a SEPARATE, later cohort that the calibrated confidence
// actually predicts success better than the raw one. Without that, a "fix" fitted to noise looks
// exactly like a real fix.
//
// Design, all deterministic and model-free:
//
//   TEMPORAL SPLIT   train = the OLDER portion, holdout = the NEWER portion, in outcome order.
//                    A random split would leak time-correlated behavior (same day, same topics)
//                    across the boundary and flatter the fit; temporal ordering is the honest
//                    separation and matches how any adopted mapping would actually be used —
//                    fitted on the past, applied to the future.
//
//   PAV FIT          pool-adjacent-violators isotonic regression on the train cohort: the unique
//                    monotone step function mapping raw confidence → empirical success rate.
//                    Monotone by construction, so a calibrated confidence can never rank two
//                    answers in the opposite order of the raw one.
//
//   HOLDOUT SCORING  Brier score and expected calibration error (ECE), raw vs calibrated, on the
//                    holdout only. The fit never sees these outcomes.
//
//   FAIL-CLOSED      a recommendation exists only when the holdout is large enough AND calibrated
//                    Brier beats raw Brier by a real margin AND ECE does not worsen. Anything
//                    else — insufficient data, no improvement, regression — reports exactly why
//                    and recommends nothing. Even a passing validation is only material for human
//                    review: nothing here can touch the live gate, and `livePolicyChanged` stays
//                    false everywhere.
//
// Per ONBOARD: zero-grounding general reasoning and current-state factual claims must not be
// conflated — callers validate per evidence-regime cohort, not only on the pooled set.

export type OutcomeSample = { predicted: number; observed: boolean; at: string }

export type IsotonicStep = { fromInclusive: number; calibrated: number }

export type HoldoutMetrics = {
  samples: number
  rawBrier: number | null
  calibratedBrier: number | null
  rawEce: number | null
  calibratedEce: number | null
}

export type HoldoutValidation = {
  trainSamples: number
  holdout: HoldoutMetrics
  mapping: IsotonicStep[]
  /** True only when the calibrated mapping PROVED itself on the later cohort. Never a policy change. */
  validated: boolean
  reason: string
}

export const MINIMUM_TRAIN_SAMPLES = 40
export const MINIMUM_HOLDOUT_SAMPLES = 20
export const HOLDOUT_FRACTION = 0.3
/** Calibrated Brier must beat raw by at least this margin on holdout — noise-level wins don't count. */
export const BRIER_IMPROVEMENT_MARGIN = 0.005
const ECE_BINS = 10

const clamp01 = (value: unknown) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0)
const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places

/** Pool-adjacent-violators: the unique monotone least-squares fit of success rate on confidence. */
export function fitIsotonicCalibration(train: readonly OutcomeSample[]): IsotonicStep[] {
  const ordered = [...train]
    .map(sample => ({ predicted: clamp01(sample.predicted), observed: sample.observed === true }))
    .sort((a, b) => a.predicted - b.predicted)
  if (!ordered.length) return []

  type Block = { weight: number; sum: number; minPredicted: number }
  const blocks: Block[] = []
  for (const sample of ordered) {
    blocks.push({ weight: 1, sum: sample.observed ? 1 : 0, minPredicted: sample.predicted })
    // Pool while the monotonicity constraint is violated.
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]
      const previous = blocks[blocks.length - 2]
      if (previous.sum / previous.weight <= last.sum / last.weight) break
      blocks.splice(blocks.length - 2, 2, {
        weight: previous.weight + last.weight,
        sum: previous.sum + last.sum,
        minPredicted: previous.minPredicted,
      })
    }
  }
  return blocks.map(block => ({ fromInclusive: round(block.minPredicted), calibrated: round(block.sum / block.weight) }))
}

/** Apply a fitted mapping: the step whose lower bound is the highest one ≤ the raw confidence. */
export function applyCalibration(mapping: readonly IsotonicStep[], predicted: number): number {
  const raw = clamp01(predicted)
  if (!mapping.length) return raw
  let calibrated = mapping[0].calibrated
  for (const step of mapping) {
    if (raw >= step.fromInclusive) calibrated = step.calibrated
    else break
  }
  return calibrated
}

export function brierScore(samples: readonly { predicted: number; observed: boolean }[]): number | null {
  if (!samples.length) return null
  const total = samples.reduce((sum, sample) => {
    const outcome = sample.observed ? 1 : 0
    return sum + (clamp01(sample.predicted) - outcome) ** 2
  }, 0)
  return round(total / samples.length)
}

export function expectedCalibrationError(samples: readonly { predicted: number; observed: boolean }[]): number | null {
  if (!samples.length) return null
  let weighted = 0
  for (let bin = 0; bin < ECE_BINS; bin += 1) {
    const lower = bin / ECE_BINS
    const upper = (bin + 1) / ECE_BINS
    const rows = samples.filter(sample => {
      const value = clamp01(sample.predicted)
      return value >= lower && (bin === ECE_BINS - 1 ? value <= 1 : value < upper)
    })
    if (!rows.length) continue
    const meanPredicted = rows.reduce((sum, row) => sum + clamp01(row.predicted), 0) / rows.length
    const observedRate = rows.filter(row => row.observed).length / rows.length
    weighted += (rows.length / samples.length) * Math.abs(meanPredicted - observedRate)
  }
  return round(weighted)
}

/** Older portion trains, newer portion validates. Outcome timestamps define the order. */
export function temporalSplit(samples: readonly OutcomeSample[]): { train: OutcomeSample[]; holdout: OutcomeSample[] } {
  const ordered = [...samples].sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const holdoutSize = Math.floor(ordered.length * HOLDOUT_FRACTION)
  return {
    train: ordered.slice(0, ordered.length - holdoutSize),
    holdout: ordered.slice(ordered.length - holdoutSize),
  }
}

/**
 * The full fail-closed validation: split, fit on the past, score raw-vs-calibrated on the future.
 * `validated: true` is evidence for HUMAN review of a threshold/confidence change — it is never a
 * change itself, and every failure path names its exact reason.
 */
export function validateCalibrationOnHoldout(samples: readonly OutcomeSample[]): HoldoutValidation {
  const clean = (Array.isArray(samples) ? samples : []).filter(
    sample => Number.isFinite(Number(sample?.predicted)) && typeof sample?.observed === 'boolean' && Boolean(sample?.at),
  )
  const { train, holdout } = temporalSplit(clean)
  const empty: HoldoutMetrics = { samples: holdout.length, rawBrier: null, calibratedBrier: null, rawEce: null, calibratedEce: null }

  if (train.length < MINIMUM_TRAIN_SAMPLES) {
    return { trainSamples: train.length, holdout: empty, mapping: [], validated: false, reason: `Insufficient training outcomes (${train.length} < ${MINIMUM_TRAIN_SAMPLES}). No calibration is fitted from this evidence.` }
  }
  if (holdout.length < MINIMUM_HOLDOUT_SAMPLES) {
    return { trainSamples: train.length, holdout: empty, mapping: [], validated: false, reason: `Insufficient held-out outcomes (${holdout.length} < ${MINIMUM_HOLDOUT_SAMPLES}). A fit without independent validation proves nothing and is not reported as usable.` }
  }

  const mapping = fitIsotonicCalibration(train)
  const rawBrier = brierScore(holdout)
  const calibratedHoldout = holdout.map(sample => ({ predicted: applyCalibration(mapping, sample.predicted), observed: sample.observed }))
  const calibratedBrier = brierScore(calibratedHoldout)
  const rawEce = expectedCalibrationError(holdout)
  const calibratedEce = expectedCalibrationError(calibratedHoldout)
  const metrics: HoldoutMetrics = { samples: holdout.length, rawBrier, calibratedBrier, rawEce, calibratedEce }

  if (rawBrier === null || calibratedBrier === null || rawEce === null || calibratedEce === null) {
    return { trainSamples: train.length, holdout: metrics, mapping, validated: false, reason: 'Holdout scoring failed; nothing is recommended.' }
  }
  if (calibratedBrier > rawBrier - BRIER_IMPROVEMENT_MARGIN) {
    return { trainSamples: train.length, holdout: metrics, mapping, validated: false, reason: `Calibrated confidence did not beat raw confidence on the later held-out cohort (Brier ${calibratedBrier} vs ${rawBrier}, margin ${BRIER_IMPROVEMENT_MARGIN}). The fitted mapping is reported for inspection only.` }
  }
  if (calibratedEce > rawEce) {
    return { trainSamples: train.length, holdout: metrics, mapping, validated: false, reason: `Brier improved but expected calibration error worsened on holdout (${calibratedEce} vs ${rawEce}); mixed evidence fails closed.` }
  }
  return {
    trainSamples: train.length,
    holdout: metrics,
    mapping,
    validated: true,
    reason: `Calibrated confidence beat raw confidence on a later held-out cohort (Brier ${calibratedBrier} vs ${rawBrier}; ECE ${calibratedEce} vs ${rawEce}). This is evidence for HUMAN review of the confidence policy — no live threshold or confidence has been changed.`,
  }
}
