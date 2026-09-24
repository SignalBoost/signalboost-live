import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createHuggingFaceArxivMetadataSearch,
  createHuggingFaceNistCybersecuritySearch,
  HUGGING_FACE_OPEN_DATASETS,
} from '../lib/cos-core/layers/learning/huggingFaceOpenData.ts'

function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  } as Response
}

test('HF search failure falls back to one bounded rows request', async () => {
  const requested: string[] = []
  const fetcher = (async (url: string | URL | Request) => {
    requested.push(String(url))
    if (requested.length === 1) return fakeResponse({ error: 'search unavailable' }, 503)
    return fakeResponse({
      rows: [{
        row_idx: 44,
        row: {
          text: 'NIST incident response guidance with bounded evidence collection.',
          embedding: Array.from({ length: 1536 }, (_, i) => i / 1536),
          metadata: JSON.stringify({ source: 'NIST incident response', type: 'section' }),
        },
      }],
    })
  }) as typeof fetch

  const rows = await createHuggingFaceNistCybersecuritySearch(fetcher)('incident response', 3)
  assert.equal(requested.length, 2)
  assert.match(requested[0], /datasets-server\.huggingface\.co\/search\?/)
  assert.match(requested[1], /datasets-server\.huggingface\.co\/rows\?/)
  assert.equal(rows.length, 1)
  assert.ok(rows[0].evidence?.includes('huggingface_access_mode:rows_fallback'))
})

test('HF arXiv metadata remains research evidence, not inferred paper training rights', async () => {
  const fetcher = (async () => fakeResponse({
    rows: [{
      row_idx: 123,
      row: {
        id: '2609.01234',
        title: 'Autonomous Software Repair with Retrieval-Augmented Agents',
        abstract: 'We study retrieval-guided autonomous software repair and evaluate repair correctness.',
        categories: 'cs.SE cs.AI',
        update_date: '2026-09-18',
        doi: '10.0000/example',
      },
    }],
  })) as typeof fetch

  const rows = await createHuggingFaceArxivMetadataSearch(fetcher)('autonomous software repair', 3)
  assert.equal(rows.length, 1)
  assert.match(rows[0].uri, /^hf:\/\/datasets\/librarian-bots\/arxiv-metadata-snapshot#train:123$/)
  assert.match(rows[0].title || '', /Autonomous Software Repair/)
  assert.ok(rows[0].evidence?.includes('huggingface_dataset:librarian-bots/arxiv-metadata-snapshot'))
  assert.ok(rows[0].evidence?.includes('huggingface_dataset_license:cc0-1.0'))
  assert.ok(rows[0].evidence?.includes('canonical_embedding_required:true'))
  assert.doesNotMatch(String(rows[0].license || '').toLowerCase(), /^cc0\b/)
  assert.match(String(rows[0].license || ''), /underlying paper training rights not asserted/i)
  assert.equal(HUGGING_FACE_OPEN_DATASETS.arxivMetadata.license, 'cc0-1.0')
})
