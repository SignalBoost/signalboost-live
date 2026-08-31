// saas/tests/cosNeuralEvidenceReasoning.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const policy = readFileSync('lib/ai/cos/cosAnswerPolicyCore.ts', 'utf8')
const grounding = readFileSync('lib/ai/cos/cosFreshGrounding.ts', 'utf8')
const synthesis = readFileSync('lib/ai/cos/freshEvidenceSynthesisContract.ts', 'utf8')
const recovery = readFileSync('lib/ai/cos/freshEvidenceContractRecovery.ts', 'utf8')
const localSynthesis = readFileSync('lib/ai/cos/freshEvidenceLocalSynthesis.ts', 'utf8')
const externalInfo = readFileSync('lib/ai/tools/getExternalInfo.ts', 'utf8')
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

test('fresh synthesis plans semantic scopes and presentation mode neurally before it writes answer prose', () => {
  assert.match(synthesis, /SEMANTIC SCOPE PLANNER/)
  assert.match(synthesis, /presentationMode/)
  assert.match(synthesis, /neutral_evidence_map/)
  assert.match(synthesis, /directBinaryAnswerSafe/)
  assert.match(synthesis, /materially different constructs, populations, denominators, units, time windows, comparison bases, controls/i)
  assert.match(synthesis, /Do not write the user-facing answer and do not expose chain-of-thought/i)
  assert.match(synthesis, /scope label must identify what is actually measured, compared,(?: established,)? or argued/i)
  assert.match(synthesis, /acceptFreshEvidenceSemanticPlan/)
  assert.match(localSynthesis, /phase: 'scope_plan'/)
  assert.match(localSynthesis, /freshEvidenceScopePlanPrompt/)
  assert.match(localSynthesis, /freshEvidenceScopePlanSystemPrompt/)
  assert.match(localSynthesis, /cos-fresh-semantic-scope-plan/)
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

test('neutral evidence maps cannot begin with a yes-no verdict', () => {
  assert.match(synthesis, /For presentationMode="neutral_evidence_map", directBinaryAnswerSafe MUST be false/i)
  assert.match(synthesis, /A neutral evidence map must never begin with a yes\/no verdict/i)
  assert.match(synthesis, /If presentationMode="neutral_evidence_map", NEVER begin with yes\/no or a single verdict/i)
  assert.match(synthesis, /args\.semanticPlan\.presentationMode === 'neutral_evidence_map'.*BINARY_LEAD\.test\(answer\)/s)
  assert.match(recovery, /inconsistent_presentation_mode/)
  assert.match(recovery, /neutral_evidence_map.*do not begin with yes\/no or a verdict/is)
})

test('measurement compatibility is a neural semantic rule rather than a named-topic formatter', () => {
  assert.match(synthesis, /Never treat estimates as one numerical range, average, trend, or pooled finding unless their population, denominator, unit, time basis, and control structure are genuinely commensurable/i)
  assert.match(synthesis, /Never combine non-commensurable numbers into one range, average, trend, or summary statistic/i)
  assert.match(synthesis, /If two sources report different numbers because they measure different things, say so explicitly/i)
  assert.match(synthesis, /Mark faithful=false if the answer blends non-commensurable estimates into one range, average, trend, consensus statistic/i)
  assert.match(synthesis, /made numerically commensurable without basis/i)
  assert.doesNotMatch(synthesis, semanticTemplateTerms)
})

test('contested or divergent evidence is presented neutrally without manufactured balance', () => {
  assert.match(synthesis, /Do not choose a side for the user/i)
  assert.match(synthesis, /do not advocate a side or tell the user what to believe/i)
  assert.match(synthesis, /Do not manufacture false balance/i)
  assert.match(synthesis, /let the user decide what to believe/i)
  assert.match(synthesis, /Mark faithful=false if genuine evidence-backed divergence is converted into advocacy/i)
  assert.match(synthesis, /Mark faithful=false if the answer creates false balance/i)
  assert.match(synthesis, /compact evidence map is better than a verdict/i)
})

test('source selection prefers direct evidence over redundant tertiary summaries', () => {
  assert.match(synthesis, /Prefer direct or primary evidence for a scope when available/i)
  assert.match(synthesis, /Do not cite a tertiary summary merely to add another source/i)
  assert.match(synthesis, /Prefer direct\/primary evidence and strong independent corroboration over redundant tertiary summaries/i)
  assert.match(externalInfo, /Tertiary reference pages can be useful background/i)
})

test('deterministic release code validates the neural plan instead of classifying semantic topics', () => {
  assert.doesNotMatch(synthesis, /GROUP_COMPARISON_CUE|GROUP_DIFFERENCE_CUE|GROUP_LEVEL_MEASURE_CUE/)
  assert.doesNotMatch(synthesis, /requiresGroupComparisonScope|explainsGroupComparisonScope/)
  assert.doesNotMatch(synthesis, semanticTemplateTerms)
  assert.match(synthesis, /presentationMode === 'neutral_evidence_map'/)
  assert.match(synthesis, /BINARY_LEAD\.test\(answer\)/)
  assert.match(synthesis, /Do not infer presentationMode from scope count/i)
  assert.doesNotMatch(synthesis, /directBinaryAnswerSafe\s*===\s*false\s*&&\s*scopes\.length\s*<\s*2/)
  assert.match(synthesis, /requiredScopeIds/)
  assert.match(synthesis, /scope\.evidenceIds\.some/)
  assert.match(synthesis, /replyCitesRequiredFreshEvidence/)
})

test('multi-scope answer prose is neurally reviewed for semantic faithfulness and neutrality before release', () => {
  assert.match(synthesis, /SCOPE-FAITHFULNESS AND NEUTRALITY REVIEWER/)
  assert.match(synthesis, /missingScopeIds/)
  assert.match(synthesis, /collapsedScopeIds/)
  assert.match(synthesis, /Mark faithful=false if a required scope is absent, materially weakened, or merged with another scope/i)
  assert.match(synthesis, /acceptFreshEvidenceFaithfulnessReview/)
  assert.match(localSynthesis, /phase: 'faithfulness_review'/)
  assert.match(localSynthesis, /reviewScopeFaithfulness/)
  assert.match(localSynthesis, /cos-fresh-scope-faithfulness-review/)
  assert.match(localSynthesis, /semanticRepairRequired/)
  assert.match(localSynthesis, /reason: 'scope_faithfulness'/)
})

test('answer synthesis preserves model-declared scopes and final repair remains neural', () => {
  assert.match(synthesis, /prior neural scope planner has already identified the semantic scopes and presentation mode/i)
  assert.match(synthesis, /Preserve the scope plan/)
  assert.match(synthesis, /presentationMode="neutral_evidence_map"/)
  assert.match(synthesis, /FINAL NEURAL REPAIR\/EDIT PASS/i)
  assert.match(synthesis, /repair every listed missing or collapsed scope/i)
  assert.match(localSynthesis, /freshEvidenceSynthesisNeedsNeuralReview/)
  assert.match(localSynthesis, /phase: 'neural_review'/)
  assert.match(localSynthesis, /review_failed_quality_boundary/)
  assert.doesNotMatch(localSynthesis, semanticTemplateTerms)
  assert.doesNotMatch(localSynthesis, /return `(?:Yes|No)|reply: `(?:Yes|No)/i)
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