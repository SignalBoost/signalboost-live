import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createHuggingFaceArxivMetadataSearch,
  createHuggingFaceGithubCc0Search,
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


test('HF dataset search failure falls back to one bounded deterministic row slice', async () => {
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
  assert.equal(rows.length, 1)
  assert.match(requested[0], /\/search\?/)
  assert.match(requested[1], /\/rows\?/)
  assert.ok(rows[0].evidence?.includes('huggingface_access_mode:rows_fallback'))
})

test('HF dataset HTTP-200 empty search falls back to bounded row access', async () => {
  const requested: string[] = []
  const fetcher = (async (url: string | URL | Request) => {
    requested.push(String(url))
    if (requested.length === 1) return fakeResponse({ rows: [] }, 200)
    return fakeResponse({
      rows: [{
        row_idx: 45,
        row: {
          text: 'NIST access control guidance for identity and zero trust systems.',
          embedding: Array.from({ length: 1536 }, (_, i) => i / 1536),
          metadata: JSON.stringify({ source: 'NIST access control', type: 'section' }),
        },
      }],
    })
  }) as typeof fetch

  const rows = await createHuggingFaceNistCybersecuritySearch(fetcher)('identity access control', 3)
  assert.equal(rows.length, 1)
  assert.equal(requested.length, 2)
  assert.match(requested[0], /\/search\?/)
  assert.match(requested[1], /\/rows\?/)
  assert.ok(rows[0].evidence?.includes('huggingface_access_mode:rows_fallback'))
})

test('HF dataset search abort falls back instead of opening the source circuit immediately', async () => {
  const requested: string[] = []
  const fetcher = (async (url: string | URL | Request) => {
    requested.push(String(url))
    if (requested.length === 1) {
      const aborted = new Error('aborted')
      aborted.name = 'AbortError'
      throw aborted
    }
    return fakeResponse({
      rows: [{
        row_idx: 46,
        row: {
          text: 'NIST incident response and cybersecurity risk management guidance.',
          embedding: Array.from({ length: 1536 }, (_, i) => i / 1536),
          metadata: JSON.stringify({ source: 'NIST resilience', type: 'section' }),
        },
      }],
    })
  }) as typeof fetch

  const rows = await createHuggingFaceNistCybersecuritySearch(fetcher)('cybersecurity incident response', 3)
  assert.equal(rows.length, 1)
  assert.equal(requested.length, 2)
  assert.ok(rows[0].evidence?.includes('huggingface_access_mode:rows_fallback'))
})


test('HF non-JSON 200 responses fall back to cached first rows', async () => {
  const requested: string[] = []
  const html200 = {
    ok: true,
    status: 200,
    async json() { throw new SyntaxError('Unexpected token <') },
  } as Response
  const fetcher = (async (url: string | URL | Request) => {
    requested.push(String(url))
    if (requested.length <= 3) return html200
    return fakeResponse({
      rows: [
        {
          row_idx: 70,
          row: {
            text: 'NIST cybersecurity risk management and incident response guidance.',
            embedding: Array.from({ length: 1536 }, (_, i) => i / 1536),
            metadata: JSON.stringify({ source: 'NIST cached row A', type: 'section' }),
          },
        },
        {
          row_idx: 71,
          row: {
            text: 'NIST zero trust architecture and identity access control guidance.',
            embedding: Array.from({ length: 1536 }, (_, i) => i / 1536),
            metadata: JSON.stringify({ source: 'NIST cached row B', type: 'section' }),
          },
        },
      ],
    })
  }) as typeof fetch

  const rows = await createHuggingFaceNistCybersecuritySearch(fetcher)('cybersecurity zero trust', 2)
  assert.equal(rows.length, 2)
  assert.equal(requested.length, 4)
  assert.match(requested[0], /\/search\?/)
  assert.match(requested[1], /\/rows\?/)
  assert.match(requested[2], /\/rows\?/)
  assert.match(requested[3], /\/first-rows\?/)
  assert.ok(rows.every(row => row.evidence?.includes('huggingface_access_mode:first_rows_fallback')))
})

test('HF arXiv metadata source is searchable research discovery but does not assert paper training rights', async () => {
  let requested = ''
  const fetcher = (async (url: string | URL | Request) => {
    requested = String(url)
    return fakeResponse({
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
    })
  }) as typeof fetch

  const rows = await createHuggingFaceArxivMetadataSearch(fetcher)('autonomous software repair', 3)
  assert.match(requested, /librarian-bots%2Farxiv-metadata-snapshot/)
  assert.equal(rows.length, 1)
  assert.match(rows[0].uri, /^hf:\/\/datasets\/librarian-bots\/arxiv-metadata-snapshot#train:123$/)
  assert.match(rows[0].title || '', /Autonomous Software Repair/)
  assert.ok(rows[0].evidence?.includes('huggingface_dataset:librarian-bots/arxiv-metadata-snapshot'))
  assert.ok(rows[0].evidence?.includes('huggingface_dataset_license:cc0-1.0'))
  assert.ok(rows[0].evidence?.includes('canonical_embedding_required:true'))
  assert.equal(classifyMassDistillationRights(rows[0].license), null)
})

test('shared live-learning factory exposes HF arXiv research independently of the brittle GitHub corpus', async () => {
  const adapters = createLiveLearningAdapters({
    COS_LIVE_SOURCES_ENABLED: 'true',
    COS_HF_OPEN_DATASETS_ENABLED: 'true',
  })
  assert.ok(adapters.some(adapter => adapter.id === 'hf_arxiv_cc0'))
  assert.equal(HUGGING_FACE_OPEN_DATASETS.arxivMetadata.dataset, 'librarian-bots/arxiv-metadata-snapshot')
  assert.equal(HUGGING_FACE_OPEN_DATASETS.arxivMetadata.license, 'cc0-1.0')

  const adapter = adapters.find(item => item.id === 'hf_arxiv_cc0')!
  const unrelated = await adapter.acquire({
    id: 'gap-unrelated-arxiv',
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
