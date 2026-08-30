// saas/tests/cosNeuralEvidenceReasoning.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const policy = readFileSync('lib/ai/cos/cosAnswerPolicyCore.ts', 'utf8')
const grounding = readFileSync('lib/ai/cos/cosFreshGrounding.ts', 'utf8')
const synthesis = readFileSync('lib/ai/cos/freshEvidenceSynthesisContract.ts', 'utf8')

const semanticTemplateTerms = /pay gap|matched-pay|matched-wage|equal work|gender identity|biological sex|reproductive sex|racist/i

test('ordinary evidence reasoning is domain-general rather than a semantic lookup table', () => {
  assert.doesNotMatch(policy, semanticTemplateTerms)
  assert.doesNotMatch(grounding, semanticTemplateTerms)

  assert.match(policy, /proposition the user actually asked/i)
  assert.match(policy, /construct, population, denominator, time window/i)
  assert.match(policy, /Distinguish observation from explanation/i)
  assert.match(policy, /Synthesize the minimum set of strong, relevant evidence/i)
})

test('fresh synthesis delegates semantic interpretation to the reasoner while keeping evidence gates deterministic', () => {
  assert.match(synthesis, /reasoning over LIVE EVIDENCE/i)
  assert.match(synthesis, /what each source actually measures or establishes/i)
  assert.match(synthesis, /Keep materially different constructs, populations, denominators, time windows/i)
  assert.match(synthesis, /Distinguish observation from explanation/i)
  assert.match(synthesis, /Synthesize the minimum set of strong, relevant evidence/i)
  assert.match(synthesis, /Return ONLY strict JSON/)
  assert.match(synthesis, /Never invent an evidence id/i)
  assert.match(synthesis, /replyCitesRequiredFreshEvidence/)
  assert.doesNotMatch(synthesis, semanticTemplateTerms)
})

test('fresh grounding tells the reasoner how to evaluate evidence, not what conclusion to reach', () => {
  assert.match(grounding, /The evidence does not define the question/i)
  assert.match(grounding, /Infer the proposition from the user’s wording/i)
  assert.match(grounding, /Keep materially different constructs, populations, denominators, time windows/i)
  assert.match(grounding, /Synthesize the strongest relevant evidence into the answer/i)
  assert.doesNotMatch(grounding, semanticTemplateTerms)
})
