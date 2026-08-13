import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assessCognitiveCompositionOpportunity,
  evaluateCognitiveCompositionEligibility,
  type CognitiveCompositionEvidence,
} from '../lib/ai/cos/cognitiveCompositionPolicy'
import {
  compositionKeyForDraft,
  validateCognitiveCompositionDraft,
  type CognitiveCompositionDraft,
} from '../lib/ai/cos/cognitiveCompositionCandidate'

const NOW = Date.parse('2026-08-13T12:00:00Z')

function evidence(patch: Partial<CognitiveCompositionEvidence> = {}): CognitiveCompositionEvidence {
  return {
    evaluatorApproved: true,
    practiceAttempts: 2,
    practiceSuccesses: 2,
    transferAttempts: 3,
    transferSuccesses: 3,
    distinctTransferVariants: 3,
    compositeScoreTotal: 2.7,
    bestMemberScoreTotal: 2.25,
    compositeWinCount: 3,
    failureCount: 0,
    lastValidatedAt: '2026-08-13T10:00:00Z',
    weakened: false,
    quarantined: false,
    ...patch,
  }
}

function draft(): CognitiveCompositionDraft {
  return {
    title: 'Diagnose and safely repair tenant-specific latency',
    description: 'Combine tenant-specific diagnosis with governed remediation planning while preserving evidence and approval boundaries.',
    problemClass: 'tenant-specific latency requiring diagnosis plus governed repair planning',
    memberSkillKeys: ['diagnose-tail-latency', 'plan-governed-remediation'],
    sequence: [
      { skillKey: 'diagnose-tail-latency', purpose: 'Identify the mechanism and discriminating evidence.', inputs: ['incident'], outputs: ['ranked causes'], preconditions: ['tenant asymmetry exists'], stopConditions: ['evidence falsifies cause'] },
      { skillKey: 'plan-governed-remediation', purpose: 'Turn the supported diagnosis into a bounded repair and verification plan.', inputs: ['ranked causes'], outputs: ['governed plan'], preconditions: ['cause has evidence'], stopConditions: ['approval or evidence missing'] },
    ],
    integrationRules: ['Do not plan a mutation until the diagnosis has a falsifiable mechanism.', 'Carry observables and approval requirements across the handoff.'],
    observables: ['tenant-scoped wait or route metric', 'post-repair verification signal'],
    falsifiers: ['tenant asymmetry disappears', 'repair target does not match diagnosed mechanism'],
    prohibitedActions: ['Do not execute production changes without required approval.'],
  }
}

test('composition opportunity requires distributed relevance from at least two skills', () => {
  assert.equal(assessCognitiveCompositionOpportunity([0.74]).eligible, false)
  assert.equal(assessCognitiveCompositionOpportunity([0.82, 0.79]).eligible, true)
  assert.equal(assessCognitiveCompositionOpportunity([0.91, 0.56]).eligible, false)
})

test('composition draft must genuinely use every declared member and no unknown member', () => {
  const valid = draft()
  assert.equal(validateCognitiveCompositionDraft(valid, valid.memberSkillKeys).ok, true)

  const ornamental = { ...valid, memberSkillKeys: [...valid.memberSkillKeys, 'security-review'] }
  assert.equal(validateCognitiveCompositionDraft(ornamental, ornamental.memberSkillKeys).ok, false)

  const unknown = { ...valid, sequence: [...valid.sequence, { ...valid.sequence[1], skillKey: 'unknown-skill' }] }
  assert.equal(validateCognitiveCompositionDraft(unknown, valid.memberSkillKeys).ok, false)
})

test('composition key is stable across member ordering', () => {
  const first = draft()
  const second = { ...first, memberSkillKeys: [...first.memberSkillKeys].reverse() }
  assert.equal(compositionKeyForDraft(first), compositionKeyForDraft(second))
})

test('passing transfer cases is insufficient if composition does not beat strongest member', () => {
  const result = evaluateCognitiveCompositionEligibility(evidence({
    compositeScoreTotal: 2.55,
    bestMemberScoreTotal: 2.46,
    compositeWinCount: 1,
  }), undefined, NOW)
  assert.equal(result.recommendedStatus, 'practiced')
  assert.ok((result.meanAdvantage ?? 0) < 0.08)
})

test('independent transfer advantage can validate a practiced composition', () => {
  const result = evaluateCognitiveCompositionEligibility(evidence(), undefined, NOW)
  assert.equal(result.recommendedStatus, 'validated')
  assert.ok((result.meanAdvantage ?? 0) >= 0.08)
})

test('local practice alone never validates composition', () => {
  const result = evaluateCognitiveCompositionEligibility(evidence({
    transferAttempts: 0,
    transferSuccesses: 0,
    distinctTransferVariants: 0,
    compositeScoreTotal: 0,
    bestMemberScoreTotal: 0,
    compositeWinCount: 0,
    lastValidatedAt: null,
  }), undefined, NOW)
  assert.equal(result.recommendedStatus, 'practiced')
})

test('evaluator approval without transfer evidence is not validation', () => {
  const result = evaluateCognitiveCompositionEligibility(evidence({
    practiceAttempts: 0,
    practiceSuccesses: 0,
    transferAttempts: 0,
    transferSuccesses: 0,
    distinctTransferVariants: 0,
    compositeScoreTotal: 0,
    bestMemberScoreTotal: 0,
    compositeWinCount: 0,
    lastValidatedAt: null,
  }), undefined, NOW)
  assert.equal(result.recommendedStatus, 'evaluated')
})

test('weakened and quarantined states override historical success counters', () => {
  assert.equal(evaluateCognitiveCompositionEligibility(evidence({ weakened: true }), undefined, NOW).recommendedStatus, 'weakened')
  assert.equal(evaluateCognitiveCompositionEligibility(evidence({ weakened: true, quarantined: true }), undefined, NOW).recommendedStatus, 'quarantined')
})
