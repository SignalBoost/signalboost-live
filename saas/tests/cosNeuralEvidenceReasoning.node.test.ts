// saas/tests/cosNeuralEvidenceReasoning.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const policy = readFileSync('lib/ai/cos/cosAnswerPolicyCore.ts', 'utf8')
const grounding = readFileSync('lib/ai/cos/cosFreshGrounding.ts', 'utf8')
const groundedAnswer = readFileSync('lib/ai/cos/freshEvidenceGroundedAnswer.ts', 'utf8')
const localSynthesis = readFileSync('lib/ai/cos/freshEvidenceLocalSynthesis.ts', 'utf8')
const externalInfo = readFileSync('lib/ai/tools/getExternalInfo.ts', 'utf8')
const semanticTaskIntent = readFileSync('lib/ai/cos/cosSemanticTaskIntent.ts', 'utf8')
const primaryRoute = readFileSync('app/api/cos-primary/route.ts', 'utf8')
const operatingCharter = readFileSync('lib/ai/cos/cosOperatingCharter.ts', 'utf8')
const reasoningPrompt = readFileSync('../cos-policy/prompts/constraint-first-reasoner.txt', 'utf8')
const reasoningDocs = readFileSync('../cos-policy/docs/reason-dont-template.md', 'utf8')
const reasoningReadme = readFileSync('../cos-policy/README.md', 'utf8')

const semanticTemplateTerms = /pay gap|matched-pay|matched-wage|equal work|gender identity|biological sex|reproductive sex|racist/i
const legacyDiagnosticTemplateTerms = /POWER AND COOLING DISCRIMINATION|hardware DVFS|ToR packet pacing|checkpoint preemption|GPU memory residue/i

test('ordinary evidence reasoning is domain-general rather than a semantic lookup table', () => {
  assert.doesNotMatch(policy, semanticTemplateTerms)
  assert.doesNotMatch(policy, legacyDiagnosticTemplateTerms)
  assert.doesNotMatch(grounding, semanticTemplateTerms)
  assert.doesNotMatch(externalInfo, semanticTemplateTerms)

  assert.match(policy, /proposition the user actually asked/i)
  assert.match(policy, /construct, population, denominator, time window/i)
  assert.match(policy, /Distinguish observation from explanation/i)
  assert.match(policy, /Synthesize the minimum set of strong, relevant evidence/i)
  assert.match(policy, /candidate causes, and mitigations/i)
})

test('live-fact synthesis is one reasoning pass that teaches evaluation method, states the host citation rule, and names no topic', () => {
  assert.doesNotMatch(groundedAnswer, semanticTemplateTerms)
  assert.doesNotMatch(groundedAnswer, legacyDiagnosticTemplateTerms)
  assert.doesNotMatch(localSynthesis, semanticTemplateTerms)
  assert.match(groundedAnswer, /Answer the user directly without showing reasoning/)
  assert.match(groundedAnswer, /Distinguish official confirmation, attributed reporting, and unresolved claims/)
  assert.match(groundedAnswer, /If sources disagree, say what each one reports instead of choosing silently/)
  assert.match(groundedAnswer, /CITATION REQUIREMENT \(enforced by the server before release\)/)
  assert.match(groundedAnswer, /replyCitesRequiredFreshEvidence\(reply, args\.input, args\.sources\)/)
  assert.doesNotMatch(groundedAnswer, /presentationMode|semanticPlan|faithful|EVIDENCE_INSUFFICIENT/)
  assert.doesNotMatch(localSynthesis, /presentationMode|semanticPlan|faithful|EVIDENCE_INSUFFICIENT|scope_plan/)
})

test('live retrieval deliberately acquires credible disagreement and alternative methodology before neural synthesis', () => {
  assert.match(externalInfo, /evidenceDiversitySearchQuery/)
  assert.match(externalInfo, /credible disagreement alternative methodology competing interpretation criticism evidence independent analysis/i)
  assert.match(externalInfo, /reserve = Math\.min\(2,/)
  assert.match(externalInfo, /Failure of the diversity lane never discards otherwise valid primary evidence/i)
  assert.match(externalInfo, /authorityRequired \|\| currentPublicOffice/)
  assert.match(externalInfo, /structuredLiveDataKind\(base\)/)
  assert.match(externalInfo, /TERTIARY_REFERENCE_HOST_SUFFIXES/)
  assert.match(externalInfo, /wikipedia\.org/)
  assert.match(externalInfo, /isTertiaryReferenceResult/)
})

test('fresh grounding tells the reasoner how to evaluate evidence, not what conclusion to reach', () => {
  assert.match(grounding, /The evidence does not define the question/i)
  assert.match(grounding, /Infer the proposition from the user’s wording/i)
  assert.match(grounding, /Keep materially different constructs, populations, denominators, time windows/i)
  assert.match(grounding, /Synthesize the strongest relevant evidence into the answer/i)
  assert.doesNotMatch(grounding, semanticTemplateTerms)
})

test('the dead duplicate COS primary route is gone so there is one Next entrypoint', () => {
  assert.equal(existsSync('app/api/cos-primary/baseRoute.ts'), false)
  assert.equal(existsSync('app/api/cos-primary/route.ts'), true)
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

test('semantic task intent is neural, multilingual, and classifies the requested task rather than quoted subject matter', () => {
  assert.match(semanticTaskIntent, /semantic task-intent judge/i)
  assert.match(semanticTaskIntent, /Use neural semantic understanding of the whole request and conversation context/i)
  assert.match(semanticTaskIntent, /Do not classify by keywords, regex patterns, named entities, dates, or isolated topical words/i)
  assert.match(semanticTaskIntent, /meaning, tone, implication, subtext, social intent/i)
  assert.match(semanticTaskIntent, /The passage may mention real people, dates, offices, events, or current facts/i)
  assert.match(semanticTaskIntent, /Infer intent equivalently in every language/i)
  assert.match(semanticTaskIntent, /When ambiguous between interpretation and verification, prefer external_fact_verification/i)
})

test('only confident supplied-context interpretation may suppress freshness', () => {
  assert.match(semanticTaskIntent, /intent\.mode === 'contextual_interpretation'/)
  assert.match(semanticTaskIntent, /intent\.suppliedContextPrimary/)
  assert.match(semanticTaskIntent, /!intent\.externalFactsRequired/)
  assert.match(semanticTaskIntent, /intent\.confidence >= 0\.72/)
})

test('semantic task intent fails safe when classification is missing, malformed, or ambiguous', () => {
  assert.match(semanticTaskIntent, /if \(start < 0 \|\| end <= start\) return null/)
  assert.match(semanticTaskIntent, /catch \{\s*return null\s*\}/s)
  assert.match(semanticTaskIntent, /prefer external_fact_verification so freshness protection fails safe/i)
})

test('primary routing lets semantic task intent decide whether a freshness signal is really a verification task', () => {
  const heuristic = primaryRoute.indexOf('heuristicRequiresFreshEvidence=requiresFreshExternalEvidence(input)&&!conversationRecallRequested')
  const semantic = primaryRoute.indexOf('? await classifyCosSemanticTaskIntent')
  const semanticFresh = primaryRoute.indexOf('semanticRequiresFreshEvidence=semanticIntentRequiresFreshness(semanticTaskIntent)')
  const baseline = primaryRoute.indexOf('baselineRequiresFreshEvidence=(modelPlannedFreshEvidence||heuristicRequiresFreshEvidence||semanticRequiresFreshEvidence)&&!conversationRecallRequested')
  const finalGate = primaryRoute.indexOf('requiresFreshEvidence=baselineRequiresFreshEvidence&&!semanticIntentSuppressesFreshness')
  assert.ok(heuristic >= 0)
  assert.ok(semantic > heuristic)
  assert.ok(semanticFresh > semantic)
  assert.ok(baseline > semanticFresh)
  assert.ok(finalGate > baseline)
  assert.match(primaryRoute, /event:'freshness_semantic_intent_suppressed'/)
})

test('COS charter treats pragmatic interpretation as reasoning, not a proof hunt, across languages', () => {
  assert.match(operatingCharter, /Evidence discipline must not erase ordinary language understanding/i)
  assert.match(operatingCharter, /wording, tone, implication, subtext, social intent/i)
  assert.match(operatingCharter, /“Not explicitly stated” is a nuance, not an automatic refusal to interpret/i)
  assert.match(operatingCharter, /Polish, Portuguese, Spanish, Russian, or English/i)
  assert.match(operatingCharter, /answer the human question first/i)
  assert.match(operatingCharter, /do not lead with evidence boilerplate/i)
})
