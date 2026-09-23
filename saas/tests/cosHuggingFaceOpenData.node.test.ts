import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createHuggingFaceNistCybersecuritySearch,
  HUGGING_FACE_OPEN_DATASETS,
} from '../lib/cos-core/layers/learning/huggingFaceOpenData.ts'
import { createLiveLearningAdapters } from '../lib/cos-core/layers/learning/liveSources.ts'
import { classifyMassDistillationRights } from '../lib/ai/cos/cosUniversityMassDistillation.ts'

function fakeResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body },
  } as Response
}

test('Hugging Face NIST source accepts only exact 1536-dimensional CC0 vector rows', async () => {
  let requested = ''
  const fetcher = (async (url: string | URL | Request) => {
    requested = String(url)
    return fakeResponse({
      rows: [
        {
          row_idx: 17,
          row: {
            text: 'NIST zero trust architecture guidance for enterprise security controls.',
            embedding: Array.from({ length: 1536 }, (_, i) => i / 1536),
            metadata: JSON.stringify({ source: 'NIST SP 800-207', type: 'semantic_chunk' }),
          },
        },
        {
          row_idx: 18,
          row: {
            text: 'Malformed vector row must not enter learning.',
            embedding: [1, 2, 3],
            metadata: '{}',
          },
        },
      ],
    })
  }) as typeof fetch

  const search = createHuggingFaceNistCybersecuritySearch(fetcher)
  const rows = await search('zero trust architecture', 4)

  assert.match(requested, /datasets-server\.huggingface\.co\/search/)
  assert.match(requested, /ethanolivertroy%2Fnist-cybersecurity-training/)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, 'NIST SP 800-207')
  assert.match(rows[0].uri, /^hf:\/\/datasets\/ethanolivertroy\/nist-cybersecurity-training#train:17$/)
  assert.match(String(rows[0].license), /^cc0 /)
  assert.ok(rows[0].evidence?.includes('huggingface_dataset:ethanolivertroy/nist-cybersecurity-training'))
  assert.ok(rows[0].evidence?.includes('huggingface_dataset_license:cc0-1.0'))
  assert.ok(rows[0].evidence?.includes('external_vector_dimensions:1536'))
  assert.ok(rows[0].evidence?.includes('external_vector_imported:false'))
  assert.ok(rows[0].evidence?.some(value => /^external_vector_sha256:[a-f0-9]{64}$/.test(value)))
})

test('Hugging Face open-data source metadata is fixed and training-rights explicit', () => {
  const source = HUGGING_FACE_OPEN_DATASETS.nistCybersecurity
  assert.equal(source.dataset, 'ethanolivertroy/nist-cybersecurity-training')
  assert.equal(source.license, 'cc0-1.0')
  assert.equal(source.vectorDimensions, 1536)
  assert.equal(source.mode, 'preembedded_cc0_dataset_search')
})

test('shared live-learning factory includes HF NIST only when enabled and keeps it scoped', async () => {
  const enabled = createLiveLearningAdapters({
    COS_LIVE_SOURCES_ENABLED: 'true',
    COS_HF_OPEN_DATASETS_ENABLED: 'true',
  })
  const disabled = createLiveLearningAdapters({
    COS_LIVE_SOURCES_ENABLED: 'true',
    COS_HF_OPEN_DATASETS_ENABLED: 'false',
  })

  assert.ok(enabled.some(adapter => adapter.id === 'hf_nist_cc0'))
  assert.ok(!disabled.some(adapter => adapter.id === 'hf_nist_cc0'))

  const adapter = enabled.find(item => item.id === 'hf_nist_cc0')!
  const unrelated = await adapter.acquire({
    id: 'gap-unrelated',
    subject: 'French literature',
    question: 'What changed in nineteenth century poetry?',
    portableIds: [],
    expectedReuse: 1,
    expectedAvoidedCostUsd: 0,
    urgency: 1,
    evidence: [],
  })
  assert.deepEqual(unrelated, [])
})

test('HF NIST CC0 material is admitted by the existing mass-distillation rights classifier', () => {
  assert.equal(
    classifyMassDistillationRights('cc0 public-domain NIST cybersecurity training dataset; source publications are public domain'),
    'cc0',
  )
  assert.equal(
    classifyMassDistillationRights('Hugging Face public dataset with unknown training rights'),
    null,
  )
})
