// Diagnostic isolation: unauthorized-path only.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCosProductionIngressManifest,
  createWebKnowledgeResearchPort,
  withCosHarnessIngress,
} from '../platform-harness/index.ts'
import { searchThroughGovernedWebKnowledge } from '../lib/ai/tools/governedWebKnowledgeSearch.ts'

test('unauthorized COS turns do not silently gain Web Knowledge research', async () => {
  const parent = createCosProductionIngressManifest({
    runId: 'web-knowledge-no-grant',
    objective: 'answer from internal knowledge',
    tenantId: 'itmounts',
  })

  await withCosHarnessIngress(parent, async () => {
    const result = await searchThroughGovernedWebKnowledge({
      query: 'current research',
      count: 3,
      research: createWebKnowledgeResearchPort({ search: async () => [] }),
      evidenceSink: { async append() { throw new Error('must not persist') } },
    })
    assert.equal(result.handled, false)
  })
})
