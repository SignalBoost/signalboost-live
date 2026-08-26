// saas/tests/cosGeneralFactGrounding.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { requiresFreshExternalEvidence } from '../lib/ai/cos/cosFreshnessPolicy.ts'

test('standalone generalized external claims require independent verification before COS endorses them', () => {
  for (const claim of [
    'Commercial models almost always attempt to answer even if source ground truth is sparse (fail-open). A custom control plane or strict enterprise gate rejects responses if verification metrics fail (fail-closed), prioritizing zero-hallucination guarantees over conversational flow.',
    'Most AI vendors usually prioritize answer coverage over abstention.',
    'Enterprise software platforms generally rely on external providers for model inference.',
  ]) {
    assert.equal(requiresFreshExternalEvidence(claim), true, claim)
  }
})

test('explicit fact-check requests require live evidence even for otherwise conceptual claims', () => {
  for (const prompt of [
    'Is this true: commercial LLMs usually answer when evidence is sparse?',
    'Fact-check this statement: most enterprise AI systems fail open.',
    'Can you confirm that AI vendors generally prioritize conversational continuity?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), true, prompt)
  }
})

test('user premises, hypotheticals, and ordinary conceptual explanations remain reasoning tasks', () => {
  for (const prompt of [
    'Our company usually requires two approvals before deployment.',
    'I usually use commercial models for drafting.',
    'Suppose most vendors fail open in this scenario. Design a strict enterprise gate.',
    'Explain why a fail-closed control plane can reduce unsupported claims.',
    'How should an enterprise verification gate work?',
  ]) {
    assert.equal(requiresFreshExternalEvidence(prompt), false, prompt)
  }
})
