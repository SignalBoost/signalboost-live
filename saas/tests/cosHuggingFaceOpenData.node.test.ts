import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createHuggingFaceGithubCc0Search,
  createHuggingFaceNistCybersecuritySearch,
  huggingFaceOpenDatasetCurriculum,
  HUGGING_FACE_OPEN_DATASETS,
} from '../lib/cos-core/layers/learning/huggingFaceOpenData.ts'
import { createLiveLearningAdapters } from '../lib/cos-core/layers/learning/liveSources.ts'
import { learningAdapterAllowedForGap } from '../lib/cos-core/layers/learning/cycle.ts'
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


test('GitHub CC0 source retains code provenance and requires canonical internal embedding', async () => {
  let requested = ''
  const fetcher = (async (url: string | URL | Request) => {
    requested = String(url)
    return fakeResponse({
      rows: [{
        row_idx: 9,
        row: {
          text: 'export async function createClient() { return new SupabaseClient() }',
          meta: {
            repo_name: 'example/cc0-app',
            repo_language: 'TypeScript',
            file_name: 'src/client.ts',
            mime_type: 'text/typescript',
          },
        },
      }],
    })
  }) as typeof fetch

  const search = createHuggingFaceGithubCc0Search(fetcher)
  const rows = await search('typescript supabase client', 4)

  assert.match(requested, /KoalaAI%2FGitHub-CC0/)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, 'example/cc0-app / src/client.ts')
  assert.match(rows[0].uri, /^hf:\/\/datasets\/KoalaAI\/GitHub-CC0#train:9$/)
  assert.match(String(rows[0].license), /^cc0 /)
  assert.ok(rows[0].evidence?.includes('huggingface_dataset:KoalaAI/GitHub-CC0'))
  assert.ok(rows[0].evidence?.includes('huggingface_dataset_license:cc0-1.0'))
  assert.ok(rows[0].evidence?.includes('external_vector_imported:false'))
  assert.ok(rows[0].evidence?.includes('canonical_embedding_required:true'))
  assert.ok(rows[0].evidence?.includes('repo_language:TypeScript'))
})

test('GitHub CC0 source is exposed by the shared learning factory only for software-relevant gaps', async () => {
  const adapters = createLiveLearningAdapters({
    COS_LIVE_SOURCES_ENABLED: 'true',
    COS_HF_OPEN_DATASETS_ENABLED: 'true',
  })
  const adapter = adapters.find(item => item.id === 'hf_github_cc0')
  assert.ok(adapter)

  const unrelated = await adapter!.acquire({
    id: 'gap-unrelated-code',
    subject: 'European art history',
    question: 'How did impressionism change nineteenth century painting?',
    portableIds: [],
    expectedReuse: 1,
    expectedAvoidedCostUsd: 0,
    urgency: 1,
    evidence: [],
  })
  assert.deepEqual(unrelated, [])

  assert.equal(HUGGING_FACE_OPEN_DATASETS.githubCc0.dataset, 'KoalaAI/GitHub-CC0')
  assert.equal(HUGGING_FACE_OPEN_DATASETS.githubCc0.license, 'cc0-1.0')
  assert.equal(HUGGING_FACE_OPEN_DATASETS.githubCc0.vectorDimensions, null)
  assert.equal(
    classifyMassDistillationRights('cc0 public-domain GitHub-CC0 software corpus'),
    'cc0',
  )
})


test('daily HF curriculum guarantees bounded exact-source attempts and rotates discovery', () => {
  const first = huggingFaceOpenDatasetCurriculum(new Date('2026-09-24T00:00:00Z'))
  const next = huggingFaceOpenDatasetCurriculum(new Date('2026-09-25T00:00:00Z'))

  assert.equal(first.length, 2)
  assert.equal(first[0]?.id, 'curriculum:hf-nist-cc0-continuous')
  assert.equal(first[1]?.id, 'curriculum:hf-github-cc0-continuous')
  assert.deepEqual(first[0]?.sourceKinds, ['public_dataset'])
  assert.deepEqual(first[0]?.allowedAdapterIds, ['hf_nist_cc0'])
  assert.deepEqual(first[1]?.allowedAdapterIds, ['hf_github_cc0'])
  assert.equal(first[0]?.curriculumAligned, true)
  assert.equal(first[1]?.curriculumAligned, true)
  assert.notEqual(first[0]?.discoveryQuery, next[0]?.discoveryQuery)
  assert.notEqual(first[1]?.discoveryQuery, next[1]?.discoveryQuery)

  const nistAdapter = { kind: 'public_dataset' as const, id: 'hf_nist_cc0', async acquire() { return [] } }
  const githubAdapter = { kind: 'public_dataset' as const, id: 'hf_github_cc0', async acquire() { return [] } }
  const otherDataset = { kind: 'public_dataset' as const, id: 'future_public_dataset', async acquire() { return [] } }

  assert.equal(learningAdapterAllowedForGap(first[0]!, nistAdapter), true)
  assert.equal(learningAdapterAllowedForGap(first[0]!, githubAdapter), false)
  assert.equal(learningAdapterAllowedForGap(first[0]!, otherDataset), false)
  assert.equal(learningAdapterAllowedForGap(first[1]!, githubAdapter), true)
  assert.equal(learningAdapterAllowedForGap(first[1]!, nistAdapter), false)
})
