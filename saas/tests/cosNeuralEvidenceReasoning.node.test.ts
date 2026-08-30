// saas/tests/cosNeuralEvidenceReasoning.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const policy = readFileSync('lib/ai/cos/cosAnswerPolicyCore.ts', 'utf8')
const grounding = readFileSync('lib/ai/cos/cosFreshGrounding.ts', 'utf8')
const synthesis = readFileSync('lib/ai/cos/freshEvidenceSynthesisContract.ts', 'utf8')
const reasoningPrompt = readFileSync('../cos-policy/prompts/constraint-first-reasoner.txt', 'utf8')
const reasoningDocs = readFileSync('../cos-policy/docs/reason-dont-template.md', 'utf8')
const reasoningReadme = readFileSync('../cos-policy/README.md', 'utf8')

const semanticTemplateTerms = /pay gap|matched-pay|matched-wage|equal work|gender identity|biological sex|reproductive sex|racist/i
const legacyDiagnosticTemplateTerms = /POWER AND COOLING DISCRIMINATION|hardware DVFS|ToR packet pacing|checkpoint preemption|GPU memory residue/i

test('ordinary evidence reasoning is domain-general rather than a semantic lookup table', () => {
  assert.doesNotMatch(policy, semanticTemplateTerms)
  assert.doesNotMatch(policy, legacyDiagnosticTemplateTerms)
  assert.doesNotMatch(grounding, semanticTemplateTerms)

  assert.match(policy, /proposition the user actually asked/i)
  assert.match(policy, /construct, population, denominator, time window/i)
  assert.match(policy, /Distinguish observation from explanation/i)
  assert.match(policy, /Synthesize the minimum set of strong, relevant evidence/i)
  assert.match(policy, /candidate causes, and mitigations/i)
})

test('fresh synthesis delegates semantic interpretation to the reasoner while keeping evidence gates deterministic', () => {
  assert.match(synthesis, /reasoning over LIVE EVIDENCE/i)
  assert.match(synthesis, /what each source actually measures or establishes/i)
  assert.match(synthesis, /Keep materially different constructs, populations, denominators, time windows/i)
  assert.match(synthesis, /Distinguish observation from explanation/i)
  assert.match(synthesis, /Synthesize the minimum set of strong, relevant evidence/i)
  assert.match(synthesis, /Compare only like-for-like measurements/i)
  assert.match(synthesis, /Return ONLY strict JSON/)
  assert.match(synthesis, /Never invent an evidence id/i)
  assert.match(synthesis, /replyCitesRequiredFreshEvidence/)
  assert.doesNotMatch(synthesis, semanticTemplateTerms)
  assert.doesNotMatch(synthesis, /unemployment, inflation, real GDP, real wages, deficit/i)
})

test('fresh grounding tells the reasoner how to evaluate evidence, not what conclusion to reach', () => {
  assert.match(grounding, /The evidence does not define the question/i)
  assert.match(grounding, /Infer the proposition from the user’s wording/i)
  assert.match(grounding, /Keep materially different constructs, populations, denominators, time windows/i)
  assert.match(grounding, /Synthesize the strongest relevant evidence into the answer/i)
  assert.doesNotMatch(grounding, semanticTemplateTerms)
})

test('legacy deterministic economic formatter cannot preempt neural evidence synthesis', () => {
  const formatter = grounding.match(/export function constructEconomicFactsReply[\s\S]*?\n}\n\nfunction requiresIndependentCorroboration/)?.[0] || ''
  assert.ok(formatter, 'expected the compatibility seam to remain discoverable')
  assert.match(formatter, /return null/)
  assert.doesNotMatch(formatter, /Opinions on who was|Measurable figures found|COS stops here/i)
})

test('repo reasoning guidance teaches a method, not named-topic answer schemas', () => {
  for (const [name, text] of [
    ['reasoning prompt', reasoningPrompt],
    ['reasoning docs', reasoningDocs],
    ['reasoning readme', reasoningReadme],
  ] as const) {
    assert.doesNotMatch(text, semanticTemplateTerms, `${name} must not encode the motivating topic`)
    assert.doesNotMatch(text, legacyDiagnosticTemplateTerms, `${name} must not encode a diagnostic topic`)
  }
  assert.match(reasoningPrompt, /Evidence supplies factual premises; you supply the inference/i)
  assert.match(reasoningPrompt, /CONTROL-PLANE BOUNDARY/)
  assert.match(reasoningPrompt, /Deterministic code may enforce source authority, freshness, citation validity, arithmetic, safety/i)
  assert.match(reasoningDocs, /The control plane may reject an unsupported semantic answer\. It should not choose the ordinary semantic conclusion in advance/i)
  assert.match(reasoningReadme, /evidence supplies facts and Qwen\/COS supplies the semantic inference/i)
})
