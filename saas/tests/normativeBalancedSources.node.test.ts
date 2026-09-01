import assert from 'node:assert/strict'
import test from 'node:test'
import { semanticCacheAllowedForPrompt } from '../lib/ai/cos/cacheSafetyPolicy.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'
import { isNormativePolicyQuestion } from '../lib/ai/cos/normativeAnswerPolicy.ts'
import { diagnoseFreshEvidenceSemanticPlan } from '../lib/ai/cos/freshEvidenceContractRecovery.ts'
import { acceptFreshEvidenceSemanticPlan, acceptFreshEvidenceSynthesis, type FreshEvidenceSemanticPlan } from '../lib/ai/cos/freshEvidenceSynthesisContract.ts'

const question = 'should man play in women sports?'
const sources = [
  { id: 'LIVE1', title: 'Evidence supporting exclusion', url: 'https://support.example/policy', snippet: 'Evidence supporting the proposition.' },
  { id: 'LIVE2', title: 'Evidence supporting inclusion', url: 'https://oppose.example/policy', snippet: 'Evidence opposing the proposition.' },
]

const balancedPlan: FreshEvidenceSemanticPlan = {
  presentationMode: 'neutral_evidence_map',
  directBinaryAnswerSafe: false,
  scopes: [
    { scopeId: 'S1', label: 'Supporting argument', finding: 'Evidence supporting the proposition.', evidenceIds: ['LIVE1'], position: 'supporting' },
    { scopeId: 'S2', label: 'Opposing argument', finding: 'Evidence opposing the proposition.', evidenceIds: ['LIVE2'], position: 'opposing' },
  ],
}

test('sports eligibility is normative, live verified, and cache excluded', () => {
  assert.equal(isNormativePolicyQuestion(question), true)
  assert.equal(requiresFreshExternalEvidence(question), true)
  assert.equal(semanticCacheAllowedForPrompt(question), false)
})

test('balanced normative synthesis labels sources for both sides', () => {
  const accepted = acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'The supporting argument emphasizes competitive equity, while the opposing argument emphasizes inclusive access. The policy choice depends on how those interests are weighted.',
      evidenceIds: ['LIVE1', 'LIVE2'],
      scopeIds: ['S1', 'S2'],
    }),
    input: question,
    sources,
    semanticPlan: balancedPlan,
  })
  assert.ok(accepted)
  assert.match(accepted.reply, /Sources supporting the proposition: \[LIVE1\]/)
  assert.match(accepted.reply, /Sources opposing the proposition: \[LIVE2\]/)
})

test('normative synthesis rejects evidence assigned to only one side', () => {
  const unbalanced: FreshEvidenceSemanticPlan = {
    ...balancedPlan,
    scopes: balancedPlan.scopes.map(scope => ({ ...scope, position: 'supporting' as const })),
  }
  assert.equal(acceptFreshEvidenceSynthesis({
    text: JSON.stringify({
      answer: 'Only one evidence-backed position is represented.',
      evidenceIds: ['LIVE1', 'LIVE2'],
      scopeIds: ['S1', 'S2'],
    }),
    input: question,
    sources,
    semanticPlan: unbalanced,
  }), null)
})

test('production-length repaired scope plans are accepted and diagnosed consistently', () => {
  const repairedPlan = JSON.stringify({
    presentationMode: 'neutral_evidence_map',
    directBinaryAnswerSafe: false,
    scopes: [
      { scopeId: 'S1', label: 'S'.repeat(200), finding: 'A'.repeat(700), evidenceIds: ['LIVE1'], position: 'supporting' },
      { scopeId: 'S2', label: 'O'.repeat(200), finding: 'B'.repeat(700), evidenceIds: ['LIVE2'], position: 'opposing' },
    ],
  })
  assert.ok(acceptFreshEvidenceSemanticPlan({ text: repairedPlan, sources }))
  assert.equal(diagnoseFreshEvidenceSemanticPlan({ text: repairedPlan, sources }), null)
})
