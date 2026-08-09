import assert from 'node:assert/strict'
import test from 'node:test'
import { bootCOSKernel } from '../lib/cos-core/cos-kernel.ts'
import { KnowledgeLayer } from '../lib/cos-core/layers/knowledge/index.ts'
import { LearningEngine, type LearningObservation } from '../lib/cos-core/layers/learning/index.ts'
import { MemoryLayer } from '../lib/cos-core/layers/memory/index.ts'

test('kernel consults learning before reasoning and records outcome', async () => {
  const observations: LearningObservation[] = []
  const learning = new LearningEngine({
    bestStrategy: async () => ({ capability: 'sales', strategy: 'reuse-buyer-profile', score: 0.9, observations: 4 }),
    observe: async (observation) => { observations.push(observation) },
  })
  const knowledge = new KnowledgeLayer({
    generateEmbedding: async () => [1],
    store: { queryNearest: async () => null, save: async () => {} },
  })
  const memory = new MemoryLayer(async ({ sessionId }) => ({ sessionId, summary: '', extractedFacts: [], recentMessages: [] }))
  let providerMessages: Array<{ role: string; content: string }> = []

  const result = await bootCOSKernel({
    taskId: 'tenant-a', sessionId: 's1', rawUserPrompt: 'find buyers', rawHistory: [],
    availableTools: [], requestedModel: 'cheap', capability: 'sales',
  }, {}, {
    knowledge, learning, memory,
    selectCompute: () => ({ provider: 'openai', model: 'cheap' }),
    executeProvider: async (input) => { providerMessages = input.messages; return { content: 'done' } },
  })

  assert.equal(result.data, 'done')
  assert.match(providerMessages[0].content, /reuse-buyer-profile/)
  assert.equal(observations.length, 1)
  assert.equal(observations[0].strategy, 'reuse-buyer-profile')
  assert.equal(observations[0].succeeded, true)
})
