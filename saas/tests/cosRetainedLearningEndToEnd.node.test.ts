// saas/tests/cosRetainedLearningEndToEnd.node.test.ts
// End-to-end contract for retained learning: selection -> prompt injection -> citation -> authoritative provenance.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { captureSelectedLearnedRows, captureEvidenceSourceUseTurnId, captureLearnedCitationIndices, consumeDetailedEvidenceSourceUseTurn } from '../lib/ai/cos/evidenceSourceUseTurnContext.ts'

test('retained learning is applied end to end, not merely embedded or retrieved', async () => {
  const enterprise = await readFile(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(enterprise, /CONTINUOUS LEARNING CORPUS:/)
  assert.match(enterprise, /context\.learned\.join\('\\n'\)/)
  assert.match(enterprise, /Retrieval alone is not learning application/)
  assert.match(enterprise, /selected \[CL#\] material must affect the answer when relevant/)
  assert.match(enterprise, /LEARNED-EVIDENCE RELEASE CONTRACT/)
  assert.match(enterprise, /put its exact \[CL#\] label immediately after that claim/)
  assert.match(enterprise, /Do not answer the same claim only from pretrained knowledge/)
  // Production acceptance regression: after semantic retrieval times out, retained knowledge must
  // still have a bounded path into CL evidence instead of spending the fallback budget embedding again.
  const learnedFallbackAt = enterprise.indexOf("boundedContextFallback('learned_lexical'")
  const learnedFallbackEnd = enterprise.indexOf('await Promise.all(fallbacks)', learnedFallbackAt)
  const learnedFallback = enterprise.slice(learnedFallbackAt, learnedFallbackEnd)
  assert.match(learnedFallback, /domainCompatibleContext\(prompt, candidate\.text\)/)
  assert.match(learnedFallback, /queryAnchors = relevanceTerms\(prompt\)/)
  assert.doesNotMatch(learnedFallback, /rankContextCandidates\(prompt/)
  // University material must be reachable by the same learned-evidence path. The 2026-09-29
  // production Bullwhip acceptance found the concept in governed distillation assets but not in
  // cos_continuous_learning, so a corpus-only gate would certify a path that cannot use training.
  assert.match(learnedFallback, /cos_university_distillation_assets/)
  assert.match(learnedFallback, /response_text\.ilike/)
  assert.match(learnedFallback, /\.eq\('model_neutral', true\)/)
  assert.match(learnedFallback, /\.eq\('contains_private_production_data', false\)/)
  assert.match(learnedFallback, /\.eq\('training_rights', 'governed_hosted_teacher_output'\)/)
  assert.match(learnedFallback, /source_kind: 'university_distillation_asset'/)
  assert.match(learnedFallback, /COS University governed training material retrieval/)

  captureSelectedLearnedRows([{
    source_kind: 'official_documentation',
    similarity: 0.93,
    content_hash: 'e2e-retained-learning-proof',
    summary: 'A retained learned fact selected for this COS turn.',
  }])
  captureEvidenceSourceUseTurnId('11111111-1111-4111-8111-111111111111')
  captureLearnedCitationIndices([1])
  const captured = consumeDetailedEvidenceSourceUseTurn()
  assert.ok(captured)
  assert.equal(captured.items.length, 1)
  assert.equal(captured.citedIndices[0], 1)

  // Native Node runs this production gate without Next.js alias resolution.
  // Inspect authoritative production provenance source without importing the Next runtime graph.
  const orchestration = await readFile(new URL('../lib/ai/cos/cosOrchestrationEnterprise.ts', import.meta.url), 'utf8')
  assert.ok(orchestration.includes("learned_corpus:{used:lc.cited>0"))
  assert.ok(orchestration.includes('retrieved_count:lc.retrieved'))
  assert.ok(orchestration.includes('relevant_count:lc.relevant'))
  assert.ok(orchestration.includes('selected_count:lc.selected'))
  assert.ok(orchestration.includes('injected_count:lc.injected'))
  assert.ok(orchestration.includes('evidence_count:lc.cited'))
})


test('production answer path binds the control-plane turn id before learned evidence flush', async () => {
  const source = await readFile(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(source, /if \(reasoned\?\.turnId\) captureEvidenceSourceUseTurnId\(reasoned\.turnId\)/)
  assert.match(source, /universityLearnedEvidenceUsed:citedUniversityLearnedEvidence/)
})



test('COS foundational education is sourced from continuous learning, not University distillation assets', async () => {
  const source = await readFile(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  const retrieval = source.slice(source.indexOf('async function retrieveInternalContext'), source.indexOf('const enterpriseStage'))
  assert.match(retrieval, /cos_continuous_learning/)
  assert.doesNotMatch(retrieval, /cos_university_distillation_assets/)
  assert.doesNotMatch(retrieval, /university_distillation_asset/)
  assert.match(retrieval, /Continuous Learning bounded lexical retrieval/)
})

test('public provenance attributes material retained-learning use without University coupling', async () => {
  const source = await readFile(new URL('../lib/ai/cos/publicRecordedProvenance.ts', import.meta.url), 'utf8')
  assert.match(source, /learnedCorpus: \{ used: boolean; cited: number; injected: number \}/)
  assert.match(source, /Recorded origin: COS used retained learned knowledge/)
  assert.doesNotMatch(source, /University material contributed/)
})
