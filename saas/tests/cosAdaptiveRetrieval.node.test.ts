import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adaptiveRetrievalTrainingCaseId,
  deriveAdaptiveRetrievalCandidate,
  selectAdaptiveRetrievalValidationCase,
  type AdaptiveRetrievalTrainingRow,
} from '../lib/ai/cos/adaptiveRetrievalPolicyLogic.ts'
import {
  effectiveLearnedCorpusInjectionLimit,
  withAdaptiveRetrievalShadowPolicy,
} from '../lib/ai/cos/adaptiveRetrievalContext.ts'

function row(caseId: string, success = true, injected = 6, cited = 0): AdaptiveRetrievalTrainingRow {
  return {
    turnId: `turn-${caseId}`,
    injected,
    cited,
    items: [],
    verifiedSuccess: success,
    repairNeeded: !success,
    outcomeSource: `evidence_utilization_benchmark:${caseId}`,
  }
}

test('adaptive retrieval does not propose a policy below the distinct-case sample gate', () => {
  const candidate = deriveAdaptiveRetrievalCandidate([
    row('a'), row('b'), row('c'), row('d'), row('e'),
  ], 0.45)
  assert.equal(candidate.eligible, false)
  assert.match(candidate.reason, /at least 6 distinct/i)
})

test('high context waste with preserved quality proposes only a 6 to 4 shadow cap', () => {
  const candidate = deriveAdaptiveRetrievalCandidate([
    row('a'), row('b'), row('c'), row('d'), row('e'), row('f', false),
  ], 0.45)
  assert.equal(candidate.eligible, true)
  assert.equal(candidate.metrics.distinctCases, 6)
  assert.equal(candidate.metrics.injected, 36)
  assert.equal(candidate.metrics.cited, 0)
  assert.equal(candidate.metrics.successRate, 0.8333)
  assert.equal(candidate.metrics.unusedRate, 1)
  assert.equal(candidate.currentPolicy.learnedCorpusMaxInjected, 6)
  assert.equal(candidate.candidatePolicy.learnedCorpusMaxInjected, 4)
  assert.equal(candidate.candidatePolicy.learnedCorpusMinSimilarity, 0.45)
  assert.equal(candidate.candidatePolicy.similarityThresholdStatus, 'unchanged_until_item_level_evidence')
})

test('guided autopsy and adaptive validation outcomes are excluded from policy training', () => {
  assert.equal(adaptiveRetrievalTrainingCaseId('failure_autopsy_retest:x:sre-a'), null)
  assert.equal(adaptiveRetrievalTrainingCaseId('adaptive_retrieval_validation:x:cloud-a:baseline'), null)
  assert.equal(adaptiveRetrievalTrainingCaseId('evidence_utilization_benchmark:sre-a'), 'sre-a')
  assert.equal(adaptiveRetrievalTrainingCaseId('capability_benchmark:memory-governance'), 'private:memory-governance')
})

test('repeated runs of one case count once rather than inflating the training breadth', () => {
  const duplicate = row('a')
  duplicate.turnId = 'newest-a'
  const older = row('a')
  older.turnId = 'older-a'
  const candidate = deriveAdaptiveRetrievalCandidate([
    duplicate, older, row('b'), row('c'), row('d'), row('e'), row('f'),
  ], 0.45)
  assert.equal(candidate.metrics.distinctCases, 6)
  assert.equal(candidate.trainingTurnIds.includes('newest-a'), true)
  assert.equal(candidate.trainingTurnIds.includes('older-a'), false)
})

test('a weak verified success rate blocks an adaptive retrieval candidate', () => {
  const candidate = deriveAdaptiveRetrievalCandidate([
    row('a', false), row('b', false), row('c'), row('d'), row('e'), row('f'),
  ], 0.45)
  assert.equal(candidate.eligible, false)
  assert.equal(candidate.metrics.successRate, 0.6667)
  assert.match(candidate.reason, /success rate/i)
})

test('validation excludes training cases and prefers a domain absent from training', () => {
  const cases = [
    { id: 'sre-a', domain: 'sre' },
    { id: 'sre-b', domain: 'sre' },
    { id: 'postgres-a', domain: 'postgres' },
    { id: 'cloud-a', domain: 'cloud' },
    { id: 'network-a', domain: 'networking' },
  ]
  const selected = selectAdaptiveRetrievalValidationCase({
    cases,
    trainingCaseIds: ['sre-a', 'postgres-a'],
    priorValidationCaseIds: [],
  })
  assert.equal(selected?.id, 'cloud-a')
})

test('second validation prefers another unused domain', () => {
  const cases = [
    { id: 'sre-a', domain: 'sre' },
    { id: 'postgres-a', domain: 'postgres' },
    { id: 'cloud-a', domain: 'cloud' },
    { id: 'cloud-b', domain: 'cloud' },
    { id: 'network-a', domain: 'networking' },
  ]
  const selected = selectAdaptiveRetrievalValidationCase({
    cases,
    trainingCaseIds: ['sre-a', 'postgres-a'],
    priorValidationCaseIds: ['cloud-a'],
  })
  assert.equal(selected?.id, 'network-a')
})

test('ordinary traffic keeps live cap while shadow validation can only reduce it', async () => {
  assert.equal(effectiveLearnedCorpusInjectionLimit(6), 6)
  await withAdaptiveRetrievalShadowPolicy({ learnedCorpusMaxInjected: 4 }, async () => {
    assert.equal(effectiveLearnedCorpusInjectionLimit(6), 4)
    assert.equal(effectiveLearnedCorpusInjectionLimit(3), 3)
  })
  assert.equal(effectiveLearnedCorpusInjectionLimit(6), 6)
})
