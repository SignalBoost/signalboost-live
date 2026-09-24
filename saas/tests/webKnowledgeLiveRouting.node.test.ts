// Diagnostic isolation: authorized-path only.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WEB_KNOWLEDGE_RESEARCH_CAPABILITY,
  createCosProductionIngressManifest,
  createWebKnowledgeResearchPort,
  withCosHarnessIngress,
} from '../platform-harness/index.ts'
import { searchThroughGovernedWebKnowledge } from '../lib/ai/tools/governedWebKnowledgeSearch.ts'

test('authorized COS research executes through a governed child HarnessRun', async () => {
  const parent = createCosProductionIngressManifest({
    runId: 'web-knowledge-parent',
    objective: 'research a current public topic',
    tenantId: 'itmounts',
    requestedCapabilities: [WEB_KNOWLEDGE_RESEARCH_CAPABILITY],
  })
  const evidence: any[] = []
  const research = createWebKnowledgeResearchPort({
    search: async () => [{
      uri: 'https://example.edu/paper',
      title: 'Example research',
      text: 'A source-backed research finding suitable for evidence synthesis.',
      evidence: ['source_class=scholarly'],
      license: 'reference_only',
    }],
  })

  await withCosHarnessIngress(parent, async () => {
    const result = await searchThroughGovernedWebKnowledge({
      query: 'research finding',
      count: 3,
      research,
      evidenceSink: { async append(record) { evidence.push(record) } },
    })
    assert.equal(result.handled, true)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.results.length, 1)
    assert.equal(result.results[0]?.url, 'https://example.edu/paper')
    assert.match(result.results[0]?.snippet || '', /source-backed research finding/)
  })

  assert.equal(evidence.length, 1)
  assert.equal(evidence[0]?.outcomeStatus, 'success')
  assert.equal(evidence[0]?.productionMutationObserved, false)
  assert.equal(evidence[0]?.parentRunId, parent.runId)
})
