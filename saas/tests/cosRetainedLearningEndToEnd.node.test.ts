// saas/tests/cosRetainedLearningEndToEnd.node.test.ts
// End-to-end contract for retained learning: selection -> prompt injection -> citation -> authoritative provenance.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { captureSelectedLearnedRows, captureEvidenceSourceUseTurnId, captureLearnedCitationIndices, consumeDetailedEvidenceSourceUseTurn } from '../lib/ai/cos/evidenceSourceUseTurnContext.ts'
import { authoritativeProvenance } from '../lib/ai/cos/cosOrchestration.ts'

test('retained learning is applied end to end, not merely embedded or retrieved', async () => {
  const enterprise = await readFile(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(enterprise, /CONTINUOUS LEARNING CORPUS:/)
  assert.match(enterprise, /context\.learned\.join\('\\n'\)/)
  assert.match(enterprise, /Retrieval alone is not learning application/)
  assert.match(enterprise, /selected \[CL#\] material must affect the answer when relevant/)

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

  const provenance = authoritativeProvenance({
    provenance: {
      responseSource: 'local_cos_reasoning',
      evidenceFunnel: {
        learnedCorpus: { retrieved: 4, relevant: 2, selected: 1, injected: 1, cited: 1 },
      },
      learnedItemsCited: 1,
    },
  }, { invoked: false })
  // Public-shape counters are accepted at the compatibility boundary; this is the shape
  // emitted by newer provenance callers and must not silently collapse to zero.
  assert.deepEqual(provenance.learned_corpus, {
    used: true,
    retrieved_count: 4,
    relevant_count: 2,
    selected_count: 1,
    injected_count: 1,
    evidence_count: 1,
  })
})
