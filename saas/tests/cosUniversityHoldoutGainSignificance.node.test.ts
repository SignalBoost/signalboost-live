// saas/tests/cosUniversityHoldoutGainSignificance.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  HOLDOUT_GAIN_ALPHA,
  HOLDOUT_GAIN_SIGNIFICANCE_PROFILE,
  assessHoldoutGain,
  recordedHoldoutGainIsSignificant,
  signFlipUpperTailPValue,
} from '../lib/ai/cos/cosUniversityHoldoutGainSignificance.ts'

const cases = (pairs: ReadonlyArray<readonly [number, number]>) => pairs.map(([baseline, candidate]) => ({ baseline, candidate }))

test('exact sign-flip p-values match hand-computed tails', () => {
  // m equal magnitudes, all positive: only one of 2^m assignments reaches the observed sum.
  assert.equal(signFlipUpperTailPValue([1, 1, 1, 1, 1, 1], 6), 1 / 64)
  // 5 up, 1 down (equal size): sum 4 is reached by 0 or 1 negative sign -> (1 + 6) / 64.
  assert.equal(signFlipUpperTailPValue([1, 1, 1, 1, 1, 1], 4), 7 / 64)
  // No nonzero differences: the tail is the whole distribution.
  assert.equal(signFlipUpperTailPValue([], 0), 1)
  // Unequal magnitudes {2,1}: sums -3,-1,1,3 each 1/4; P(S >= 1) = 1/2.
  assert.equal(signFlipUpperTailPValue([2, 1], 1), 0.5)
})

test('the coin-flip pass that graduated artifacts is no longer a pass', () => {
  // One case better by half a point, five ties: the old gate (candidate mean > baseline mean) graduated this shape.
  const oneCaseBetter = assessHoldoutGain(cases([[0.5, 1], [1, 1], [1, 1], [1, 1], [0, 0], [1, 1]]))
  assert.ok(oneCaseBetter.meanGain > 0, 'the old gate (candidate mean > baseline mean) passed this')
  assert.equal(oneCaseBetter.improvedCases, 1)
  assert.equal(oneCaseBetter.tiedCases, 5)
  assert.equal(oneCaseBetter.pValue, 0.5)
  assert.equal(oneCaseBetter.significant, false)

  // Mixed movement with a positive mean: also chance.
  const mixed = assessHoldoutGain(cases([[0, 1], [0, 1], [1, 0.5], [0.5, 1], [0, 0], [1, 0]]))
  assert.ok(mixed.meanGain > 0)
  assert.equal(mixed.significant, false)
})

test('a real, consistent gain on a 6-case holdout is significant', () => {
  const allBetter = assessHoldoutGain(cases([[0, 1], [0, 0.5], [0.5, 1], [0, 1], [0, 0.5], [0.5, 1]]))
  assert.equal(allBetter.improvedCases, 6)
  assert.equal(allBetter.pValue, 1 / 64)
  assert.equal(allBetter.significant, true)

  // Five improve, one tie: p = 1/32 <= 0.05.
  const fiveOfSix = assessHoldoutGain(cases([[0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [1, 1]]))
  assert.equal(fiveOfSix.pValue, 1 / 32)
  assert.equal(fiveOfSix.significant, true)

  // Four improve, two ties: p = 1/16 > 0.05 - not enough evidence on this holdout size.
  const fourOfSix = assessHoldoutGain(cases([[0, 1], [0, 1], [0, 1], [0, 1], [1, 1], [1, 1]]))
  assert.equal(fourOfSix.pValue, 1 / 16)
  assert.equal(fourOfSix.significant, false)
})

test('the gate only removes passes: significant always implies a strictly higher candidate mean', () => {
  // Exhaustive over every 0 / 0.5 / 1 judge outcome on a 4-case holdout (9^4 = 6561 exams) plus random 6-case exams.
  const grid = [0, 0.5, 1]
  const outcomes = grid.flatMap(b => grid.map(c => [b, c] as const))
  let significantCount = 0
  for (const a of outcomes) for (const b of outcomes) for (const c of outcomes) for (const d of outcomes) {
    const assessment = assessHoldoutGain(cases([a, b, c, d]))
    const baselineMean = (a[0] + b[0] + c[0] + d[0]) / 4
    const candidateMean = (a[1] + b[1] + c[1] + d[1]) / 4
    if (assessment.significant) {
      significantCount += 1
      assert.ok(candidateMean > baselineMean)
    }
    assert.ok(assessment.pValue >= 0 && assessment.pValue <= 1)
  }
  // Minimum attainable p on 4 cases is 1/16 > alpha, so nothing passes there: stated, not hidden.
  assert.equal(significantCount, 0)

  let seed = 7
  const random = () => { seed = (seed * 48271) % 2147483647; return grid[seed % 3] }
  for (let run = 0; run < 2000; run += 1) {
    const exam = Array.from({ length: 6 }, () => [random(), random()] as const)
    const assessment = assessHoldoutGain(cases(exam))
    if (assessment.significant) assert.ok(assessment.meanGain > 0)
  }
})

test('a no-effect evaluator passes about alpha or less, the old gate passed far more', () => {
  // Null simulation: baseline and candidate drawn identically, as the 7-day production trace measured.
  let seed = 11
  const random = () => { seed = (seed * 48271) % 2147483647; return [0, 0.5, 1][seed % 3] }
  let oldGatePasses = 0
  let newGatePasses = 0
  const exams = 20_000
  for (let run = 0; run < exams; run += 1) {
    const exam = Array.from({ length: 6 }, () => [random(), random()] as const)
    const assessment = assessHoldoutGain(cases(exam))
    if (assessment.meanGain > 0) oldGatePasses += 1
    if (assessment.significant) newGatePasses += 1
  }
  const oldRate = oldGatePasses / exams
  const newRate = newGatePasses / exams
  console.log(`[holdout-gain-null] exams=${exams} oldGatePassRate=${oldRate.toFixed(4)} newGatePassRate=${newRate.toFixed(4)} alpha=${HOLDOUT_GAIN_ALPHA}`)
  assert.ok(oldRate > 0.35, 'the old gate passes a no-effect artifact a large share of the time')
  assert.ok(newRate <= HOLDOUT_GAIN_ALPHA, 'the new gate keeps the false-graduation rate at or below alpha')
})

test('invalid or missing scores fail closed instead of producing a verdict', () => {
  assert.throws(() => assessHoldoutGain([]), /holdout_gain_cases_missing/)
  assert.throws(() => assessHoldoutGain(cases([[0, 1.2]])), /holdout_gain_score_invalid/)
  assert.throws(() => assessHoldoutGain([{ baseline: Number.NaN, candidate: 1 }]), /holdout_gain_score_invalid/)
  assert.throws(() => assessHoldoutGain([{ baseline: null as unknown as number, candidate: 1 }]), /holdout_gain_score_invalid/)
})

test('recorded significance is read back strictly', () => {
  const real = assessHoldoutGain(cases([[0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1]]))
  assert.equal(recordedHoldoutGainIsSignificant({ baselineScore: 0, trainedArtifactScore: 1, significance: real }), true)
  // Survives the JSON round trip through the evidence table.
  assert.equal(recordedHoldoutGainIsSignificant(JSON.parse(JSON.stringify({ significance: real }))), true)
  assert.equal(recordedHoldoutGainIsSignificant({ baselineScore: 0.875, trainedArtifactScore: 0.925 }), false)
  assert.equal(recordedHoldoutGainIsSignificant(null), false)
  assert.equal(recordedHoldoutGainIsSignificant({ significance: { ...real, significant: false } }), false)
  assert.equal(recordedHoldoutGainIsSignificant({ significance: { ...real, profile: 'other' } }), false)
  assert.equal(recordedHoldoutGainIsSignificant({ significance: { ...real, alpha: 0.2 } }), false)
  assert.equal(recordedHoldoutGainIsSignificant({ significance: { ...real, pValue: 0.3 } }), false)
  assert.equal(real.profile, HOLDOUT_GAIN_SIGNIFICANCE_PROFILE)
})

test('the mass evaluator gates the holdout on significance and records it on the run and the completed exam', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
  assert.match(source, /import \{ assessHoldoutGain \} from '\.\/cosUniversityHoldoutGainSignificance\.ts'/)
  assert.match(source, /const holdoutGain=assessHoldoutGain\(holdout\.scored\)/)
  assert.match(source, /const holdoutImproved=holdoutGain\.significant;/)
  assert.doesNotMatch(source, /holdoutImproved=holdout\.candidateScore>holdout\.baselineScore/)
  assert.match(source, /holdout_improved:holdoutImproved/)
  assert.match(source, /holdoutGainSignificance:holdoutGain/)
  assert.match(source, /improved:holdoutImproved,cases:holdoutCases\.length,significance:holdoutGain\}/)
})
