// saas/tests/cosUniversityHoldoutRegressionEvidence.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  HOLDOUT_REGRESSION_EVIDENCE_PROFILE,
  buildHoldoutRegressionEvidence,
  summarizeHoldoutRegressionEvidence,
} from '../lib/ai/cos/cosUniversityHoldoutRegressionEvidence.ts'
import { composeCapabilityGainTrace, describeCapabilityGainTrace } from '../lib/ai/cos/cosUniversityCapabilityGainTrace.ts'

// The shape that prompted this (Production 2026-10-07, mass:9c294540): baseline 1.00 -> trained 0.25 on 12 cases.
const scored = [
  ...Array.from({ length: 9 }, (_, i) => ({ id: `case-${i}`, baseline: 1, candidate: 0 })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `case-${9 + i}`, baseline: 1, candidate: 1 })),
]
const baselineAnswers = new Map(scored.map(item => [item.id, `The effect is X because the test shows Y for ${item.id}.`]))
const candidateAnswers = new Map(scored.map((item, index) => [item.id, index < 4 ? '' : index < 9 ? 'Wrong   answer\n text '.repeat(40) : 'Correct.']))

test('records every regressed case with scores, lengths, emptiness and bounded excerpts', () => {
  const evidence = buildHoldoutRegressionEvidence({ scored, baselineAnswers, candidateAnswers })
  assert.equal(evidence.profile, HOLDOUT_REGRESSION_EVIDENCE_PROFILE)
  assert.equal(evidence.holdoutCases, 12)
  assert.equal(evidence.regressedCases, 9)
  assert.equal(evidence.cases.length, 9)
  assert.equal(evidence.cases.filter(item => item.candidateEmpty).length, 4)
  const wrong = evidence.cases[5]
  assert.equal(wrong.candidateEmpty, false)
  assert.ok(wrong.candidateChars > 280)
  assert.equal(wrong.candidateExcerpt.length, 280, 'excerpt is bounded')
  assert.doesNotMatch(wrong.candidateExcerpt, /\s{2,}|\n/, 'whitespace is flattened')
  // Ties and improvements are not regressions.
  assert.ok(evidence.cases.every(item => item.candidate < item.baseline))
})

test('a missing answer counts as empty, never as substantive', () => {
  const evidence = buildHoldoutRegressionEvidence({ scored: [{ id: 'a', baseline: 1, candidate: 0 }], baselineAnswers: new Map([['a', 'ok']]), candidateAnswers: new Map() })
  assert.equal(evidence.cases[0].candidateEmpty, true)
  assert.equal(evidence.cases[0].candidateChars, 0)
})

test('the summary is counts and lengths only, and separates exams recorded before this change', () => {
  const evidence = buildHoldoutRegressionEvidence({ scored, baselineAnswers, candidateAnswers })
  const summary = summarizeHoldoutRegressionEvidence([
    { baseline: 1, evidence: JSON.parse(JSON.stringify(evidence)) },
    { baseline: 0.5, evidence: buildHoldoutRegressionEvidence({ scored: [{ id: 'b', baseline: 0, candidate: 1 }], baselineAnswers: new Map(), candidateAnswers: new Map() }) },
    { baseline: 0.92, evidence: null },
  ])
  console.log('[holdout-regression-summary]', JSON.stringify(summary))
  assert.equal(summary.examsWithEvidence, 2)
  assert.equal(summary.examsWithoutEvidence, 1)
  assert.equal(summary.examsWithARegressedCase, 1)
  assert.equal(summary.regressedCases, 9)
  assert.equal(summary.emptyCandidateAnswers, 4)
  assert.equal(summary.substantiveCandidateAnswers, 5)
  assert.equal(summary.examsWithBaselineAtLeast0_9, 2)
  assert.doesNotMatch(JSON.stringify(summary), /Wrong|effect is X|case-/)
})

test('the Step 1 capability gain trace prints the regression block from the run row', () => {
  const H = (c: string) => c.repeat(64)
  const evidence = buildHoldoutRegressionEvidence({ scored, baselineAnswers, candidateAnswers })
  const trace = composeCapabilityGainTrace({
    now: new Date('2026-10-07T15:00:00Z'), since: '2026-09-30T15:00:00Z',
    evaluations: [{ candidate_id: 'mass:x', trained_artifact_hash: H('a'), created_at: '2026-10-07T04:40:00Z', baseline_score: 1, trained_artifact_score: 0.25, holdout_case_count: 12, regression: evidence }],
    artifacts: [], attributions: [],
  })
  const text = describeCapabilityGainTrace(trace)
  console.log(text.split('\n').find(line => line.includes('holdout regressions')))
  assert.match(text, /holdout regressions .*examsWithEvidence=1 notRecorded=0 examsWithARegressedCase=1 regressedCases=9 candidateAnswer empty=4 substantive=5/)
  assert.match(text, /exams with baseline>=0\.9: 1/)
  assert.doesNotMatch(text, /Wrong answer|effect is X/, 'no answer text leaves the trace')
})

test('the evaluator records the evidence on the run row and nothing reads it back into a decision', () => {
  const evaluator = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation.ts', import.meta.url), 'utf8')
  assert.match(evaluator, /const holdoutRegression=buildHoldoutRegressionEvidence\(\{scored:holdout\.scored,baselineAnswers:holdoutBaseline\.answers,candidateAnswers:holdoutCandidate\.answers\}\)/)
  assert.match(evaluator, /holdoutRegressionEvidence:holdoutRegression,/)
  assert.match(evaluator, /const holdoutImproved=holdoutGain\.significant;/, 'the gate is unchanged')
  const trace = readFileSync(new URL('../lib/ai/cos/cosUniversityCapabilityGainTrace.ts', import.meta.url), 'utf8')
  assert.match(trace, /regression:response_hashes->holdoutRegressionEvidence/)
})
