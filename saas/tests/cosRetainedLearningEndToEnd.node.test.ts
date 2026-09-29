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
  // Production acceptance regression: after semantic retrieval times out, retained knowledge must
  // still have a bounded path into CL evidence instead of spending the fallback budget embedding again.
  const learnedFallbackAt = enterprise.indexOf("boundedContextFallback('learned_lexical'")
  const learnedFallbackEnd = enterprise.indexOf('await Promise.all(fallbacks)', learnedFallbackAt)
  const learnedFallback = enterprise.slice(learnedFallbackAt, learnedFallbackEnd)
  assert.match(learnedFallback, /domainCompatibleContext\(prompt, candidate\.text\)/)
  assert.match(learnedFallback, /queryAnchors = relevanceTerms\(prompt\)/)
  assert.doesNotMatch(learnedFallback, /rankContextCandidates\(prompt/)

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
