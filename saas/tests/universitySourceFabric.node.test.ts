import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  UNIVERSITY_SOURCE_MANIFESTS,
  bindUniversitySourcePlugin,
  createUniversityMcpSourcePlugin,
  universitySourceSupports,
  validateUniversitySourceManifest,
} from '../lib/cos-core/layers/learning/sourceFabric.ts'

test('University source fabric treats study/projects as first-class for every registered source', () => {
  assert.ok(UNIVERSITY_SOURCE_MANIFESTS.length >= 10)
  for (const manifest of UNIVERSITY_SOURCE_MANIFESTS) {
    assert.equal(manifest.capabilities.includes('discovery'), true, manifest.id)
    assert.equal(manifest.capabilities.includes('working_agent_rag'), true, manifest.id)
    assert.equal(manifest.capabilities.includes('university_study'), true, manifest.id)
    assert.equal(manifest.capabilities.includes('university_projects'), true, manifest.id)
  }
  assert.equal(universitySourceSupports('project_gutenberg_pd', 'weight_distillation_candidate'), true)
  assert.equal(universitySourceSupports('europe_pmc', 'weight_distillation_candidate'), true)
  assert.equal(universitySourceSupports('semantic_scholar', 'weight_distillation_candidate'), false)
  assert.equal(universitySourceSupports('open_library', 'weight_distillation_candidate'), false)
})

test('source manifest refuses weight-distillation capability without a rights policy', () => {
  assert.throws(() => validateUniversitySourceManifest({
    id: 'bad_source',
    name: 'Bad Source',
    sourceKind: 'scientific_journal',
    transport: 'native_api',
    capabilities: ['discovery','working_agent_rag','university_study','university_projects','weight_distillation_candidate'],
    rightsMode: 'reference_only',
    costClass: 'free',
    enabledByDefault: true,
  }), /distillation_without_rights_policy/)
})

test('MCP learning source is plug-compatible but still enters the ordinary University adapter contract', async () => {
  const calls: any[] = []
  const plugin = createUniversityMcpSourcePlugin({
    manifest: {
      id: 'example_science_mcp',
      name: 'Example Science MCP',
      sourceKind: 'scientific_journal',
      transport: 'mcp',
      capabilities: ['discovery','metadata','abstract','internal_reembedding','working_agent_rag','university_study','university_projects'],
      rightsMode: 'reference_only',
      costClass: 'configured',
      enabledByDefault: false,
    },
    port: {
      async search(input) {
        calls.push(input)
        return [{
          uri: 'https://example.org/paper/1',
          title: 'Example paper',
          text: 'A sufficiently useful scientific abstract and reference record for a University study objective.',
          license: 'reference-only',
        }]
      },
    },
    maxResults: 2,
  })
  const adapter = bindUniversitySourcePlugin(plugin)
  const docs = await adapter.acquire({
    id: 'test-gap',
    subject: 'Computer Science & Coding',
    question: 'What evidence improves retrieval evaluation?',
    discoveryQuery: 'retrieval evaluation',
    portableIds: ['cos'],
    expectedReuse: 1,
    expectedAvoidedCostUsd: 0,
    urgency: 1,
  })
  assert.equal(adapter.id, 'example_science_mcp')
  assert.equal(adapter.kind, 'scientific_journal')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], { query: 'retrieval evaluation', limit: 2 })
  assert.equal(docs.length, 1)
  assert.equal(docs[0].sourceUri, 'https://example.org/paper/1')
})

test('live source factory has a plug-in seam instead of requiring University core changes', () => {
  // Keep this regression source-level: importing the entire live-source graph under node --test
  // would test Node's strip-only loader against unrelated provider modules rather than this seam.
  const live = readFileSync(new URL('../lib/cos-core/layers/learning/liveSources.ts', import.meta.url), 'utf8')
  assert.match(live, /createLiveLearningAdapters\(env:LiveLearningEnvironment=process\.env,sourcePlugins:readonly UniversitySourcePlugin\[\]=\[\]\)/)
  assert.match(live, /for\(const plugin of sourcePlugins\)adapters\.push\(bindUniversitySourcePlugin\(plugin\)\)/)
})
