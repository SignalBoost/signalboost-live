import assert from 'node:assert/strict'
import test from 'node:test'
import { groundingScore, resolveExtractionBatch, toKnowledgeFact, factId, FACT_EXTRACTION_TASK_ID, type ExtractionSourceDocument } from '../lib/ai/cos/knowledgeFactExtraction'
import { nearestFoundationalSubject } from '../lib/cos-core/layers/learning/foundational'

const SOURCE = 'pg_stat_activity exposes wait events, letting an operator distinguish time spent executing a query from time spent waiting on a connection pool or a lock.'

test('a claim the document supports is grounded; an invented one is not', () => {
  const supported = groundingScore('wait events distinguish query execution time from connection pool waiting time', SOURCE)
  const invented = groundingScore('Oracle Exadata storage cells accelerate columnar scans for warehouse workloads', SOURCE)

  assert.ok(supported >= 0.6, `paraphrase of the source should ground, got ${supported}`)
  assert.ok(invented < 0.3, `fabricated claim should not ground, got ${invented}`)
})

test('grounding tolerates paraphrase but not topic drift', () => {
  const paraphrase = groundingScore('An operator can separate execution time from pool waiting time using wait events', SOURCE)
  const drift = groundingScore('Kubernetes horizontal pod autoscaling reacts to CPU pressure within minutes', SOURCE)
  assert.ok(paraphrase > drift)
})

const DOCS: ExtractionSourceDocument[] = [
  { contentHash: 'a', subject: 's', summary: 'text one', sourceUri: 'https://example.com/a', confidence: 0.8 },
  { contentHash: 'b', subject: 's', summary: 'text two', sourceUri: 'https://example.com/b', confidence: 0.8 },
  { contentHash: 'c', subject: 's', summary: '   ', sourceUri: 'https://example.com/c', confidence: 0.8 },
]

test('extraction skips already-extracted documents and documents with no excerpt', () => {
  const batch = resolveExtractionBatch(DOCS, new Set(['https://example.com/a']), 10)
  assert.deepEqual(batch.map(d => d.sourceUri), ['https://example.com/b'])
})

test('re-extraction is opt-in and bounded by the limit', () => {
  const all = resolveExtractionBatch(DOCS, new Set(['https://example.com/a']), 10, true)
  assert.deepEqual(all.map(d => d.sourceUri), ['https://example.com/a', 'https://example.com/b'])
  assert.equal(resolveExtractionBatch(DOCS, new Set(), 1).length, 1)
})

test('fact ids are deterministic so re-extraction updates rather than duplicates', () => {
  const first = toKnowledgeFact({ subject: 'connection pool saturation', predicate: 'causes', object: 'tenant-specific tail latency', confidence: 0.7 }, 'https://example.com/a')
  const second = toKnowledgeFact({ subject: 'connection pool saturation', predicate: 'causes', object: 'a different wording entirely', confidence: 0.6 }, 'https://example.com/b')

  assert.equal(first.id, second.id)
  assert.equal(first.id, factId(FACT_EXTRACTION_TASK_ID, 'connection pool saturation', 'causes'))
  assert.equal(first.source, 'https://example.com/a', 'attribution must survive onto the fact')
})

test('a chat question is filed under a curriculum domain, not under its own wording', () => {
  const subject = nearestFoundationalSubject('A multi-tenant SaaS shows normal database CPU but API p95 latency triples only for enterprise tenants')
  assert.ok(subject, 'a database latency question must map to a domain')
  assert.ok(!subject!.includes('suddenly'), 'the subject must not be a copy of the question')
  assert.ok(/postgresql|reliability/i.test(subject!), `expected a database or SRE domain, got ${subject}`)
})

test('a question outside the curriculum maps to nothing rather than to the closest domain', () => {
  assert.equal(nearestFoundationalSubject('what time does the bakery on the corner open tomorrow'), null)
})
