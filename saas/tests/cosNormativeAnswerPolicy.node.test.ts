import assert from 'node:assert/strict'
import test from 'node:test'
import { isNormativePolicyQuestion, normativeAnswerContractViolations } from '../lib/ai/cos/normativeAnswerPolicy.ts'
import { quantitativeAnswerPolicyText } from '../lib/ai/cos/cosAnswerPolicyCore.ts'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

const prompts = [
  'should abortion be legal?',
  'should gay marriage be allowed?',
  'should women be allowed to vote?',
]

test('owner acceptance questions share one normative classifier', () => {
  for (const prompt of prompts) {
    assert.equal(isNormativePolicyQuestion(prompt), true, prompt)
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
  }
})

test('the policy generalizes beyond the motivating questions', () => {
  for (const prompt of [
    'Should the death penalty be abolished?',
    'Should governments ban religious clothing?',
    'Should assisted dying be permitted?',
    'Is capital punishment morally justified?',
    'Are compulsory vaccinations ethical?',
    'Should sixteen-year-olds be allowed to vote?',
  ]) {
    assert.equal(isNormativePolicyQuestion(prompt), true, prompt)
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
  }
})

test('normative policy forbids a yes/no verdict and requires neutral developed analysis', () => {
  const policy = quantitativeAnswerPolicyText()
  assert.match(policy, /never begin with Yes or No/i)
  assert.match(policy, /competing normative principles/i)
  for (const prompt of prompts) {
    const violations = normativeAnswerContractViolations(prompt, 'Yes, this should be allowed.')
    assert.ok(violations.includes('normative_binary_lead'), prompt)
    assert.ok(violations.includes('normative_answer_underdeveloped'), prompt)
    assert.ok(violations.includes('normative_competing_frameworks_missing'), prompt)
  }
})

test('a developed neutral evidence map clears the deterministic release contract', () => {
  const answer = `${'The descriptive context and current legal position vary by jurisdiction and time. '.repeat(4)} Supporters emphasize liberty, equality, autonomy, and protection from state interference. Opponents emphasize competing rights, social obligations, tradition, or moral status. However, empirical evidence can establish legal effects, practical outcomes, and public attitudes; it cannot by itself select the controlling moral premise. The resulting policy judgment therefore depends on how those competing principles are weighted, while factual claims within the debate should still be evaluated against current authoritative evidence.`
  for (const prompt of prompts) assert.deepEqual(normativeAnswerContractViolations(prompt, answer), [], prompt)
})

test('descriptive legal lookups are not misclassified as normative', () => {
  assert.equal(isNormativePolicyQuestion('Is abortion currently legal in Florida?'), false)
  assert.equal(isNormativePolicyQuestion('What year were women allowed to vote in the United States?'), false)
  assert.equal(isNormativePolicyQuestion('Should I restart the production server?'), false)
  assert.equal(isNormativePolicyQuestion('Should we upgrade Next.js?'), false)
})
