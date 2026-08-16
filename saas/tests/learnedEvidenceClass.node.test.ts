// saas/tests/learnedEvidenceClass.node.test.ts
//
// Pins the fix for "6 corpus rows injected, 0 cited". The row sizes below mirror the measured
// production corpus: journal/discovery rows averaged ~161–188 characters while real documentation
// and transcripts run into the thousands.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyLearnedEvidence,
  selectLearnedCorpusRows,
  learnedEvidenceLabel,
} from '../lib/ai/cos/learnedEvidenceClass'

const stub = (id: string) => ({ id, summary: `Abstract for paper ${id}: we study latency in distributed systems.` }) // ~70 chars
const full = (id: string) => ({ id, summary: `Document ${id}. ${'Connection pool saturation raises queue time before service time. '.repeat(20)}` })

test('a short abstract is metadata; a real document is full content', () => {
  assert.equal(classifyLearnedEvidence(stub('A')), 'metadata')
  assert.equal(classifyLearnedEvidence(full('B')), 'full')
  assert.equal(classifyLearnedEvidence({ summary: '' }), 'metadata')
  assert.equal(classifyLearnedEvidence({}), 'metadata')
})

test('substantive rows take the injection slots ahead of abstract stubs', () => {
  // Relevance order deliberately puts stubs first — exactly the production case where 86 of 101
  // rows are abstracts and crowd out the few citable documents.
  const rows = [stub('s1'), stub('s2'), full('f1'), stub('s3'), full('f2'), stub('s4'), stub('s5')]
  const selected = selectLearnedCorpusRows(rows, 3)
  assert.deepEqual(selected.map(row => row.id), ['f1', 'f2', 's1'], 'full rows first, then stubs fill leftovers')
})

test('relevance order is preserved within each class', () => {
  const rows = [full('f1'), full('f2'), full('f3')]
  assert.deepEqual(selectLearnedCorpusRows(rows, 2).map(r => r.id), ['f1', 'f2'])
})

test('metadata rows are still used when nothing substantive is relevant', () => {
  const rows = [stub('s1'), stub('s2')]
  assert.deepEqual(selectLearnedCorpusRows(rows, 6).map(r => r.id), ['s1', 's2'], 'a pointer beats an empty context')
})

test('slot limit is respected and non-positive limits yield nothing', () => {
  assert.equal(selectLearnedCorpusRows([full('a'), full('b'), full('c')], 2).length, 2)
  assert.equal(selectLearnedCorpusRows([full('a')], 0).length, 0)
})

test('metadata rows are announced as pointers so the reasoner cannot quote them as content', () => {
  const label = learnedEvidenceLabel('metadata')
  assert.match(label, /full text NOT retrieved/i)
  assert.match(label, /do not quote/i)
  assert.equal(learnedEvidenceLabel('full'), 'retrieved content')
})
