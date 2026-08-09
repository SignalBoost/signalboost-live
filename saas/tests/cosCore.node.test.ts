import assert from 'node:assert/strict'
import test from 'node:test'
import { bootCOSKernel, pingBusinessRule } from '../lib/cos-core/cos-kernel.ts'
import { ExactCacheLayer, MemoryExactCacheStore } from '../lib/cos-core/layers/exact-cache/index.ts'
import { KnowledgeLayer, type KnowledgeRecord } from '../lib/cos-core/layers/knowledge/index.ts'
import { MemoryLayer } from '../lib/cos-core/layers/memory/index.ts'
import { ToolCompiler, type CanonicalToolDescription } from '../lib/cos-core/layers/reasoning/index.ts'

const echoTool: CanonicalToolDescription<{ value: string }, string> = {
  name: 'echo',
  description: 'Echoes a value.',
  parameters: {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
  },
  execute: async ({ value }) => value,
}

test('canonical tools compile to both provider schemas', () => {
  const openai = ToolCompiler.toOpenAI([echoTool])
  assert.equal(openai[0].function.name, 'echo')
  assert.equal(openai[0].function.parameters.additionalProperties, false)

  const anthropic = ToolCompiler.toAnthropic([echoTool])
  assert.equal(anthropic[0].name, 'echo')
  assert.deepEqual(anthropic[0].cache_control, { type: 'ephemeral' })
})

test('semantic cache hits avoid provider execution', async () => {
  let providerCalls = 0
  const saved: KnowledgeRecord[] = []
  const knowledge = new KnowledgeLayer({
    generateEmbedding: async () => [1, 0],
    store: {
      queryNearest: async () => ({
        taskId: 'tenant-a',
        originalPrompt: 'repeat',
        responsePayload: 'cached',
        similarityScore: 0.99,
      }),
      save: async (record) => { saved.push(record) },
    },
  })
  const memory = new MemoryLayer(async ({ sessionId }) => ({
    sessionId,
    summary: 'summary',
    extractedFacts: [],
    recentMessages: [],
  }))

  const result = await bootCOSKernel({
    taskId: 'tenant-a',
    sessionId: 'session-a',
    rawUserPrompt: 'repeat',
    rawHistory: [],
    availableTools: [],
    requestedModel: 'cheap',
  }, {}, {
    knowledge,
    memory,
    selectCompute: () => ({ provider: 'openai', model: 'cheap' }),
    executeProvider: async () => {
      providerCalls += 1
      return { content: 'provider' }
    },
  })

  assert.equal(result.data, 'cached')
  assert.equal(result.source, 'semantic_cache')
  assert.equal(providerCalls, 0)
  assert.equal(saved.length, 0)
})

test('exact cache hits avoid embeddings and provider execution', async () => {
  let embeddings = 0
  let providerCalls = 0
  const exactCache = new ExactCacheLayer(new MemoryExactCacheStore())
  const knowledge = new KnowledgeLayer({
    generateEmbedding: async () => { embeddings += 1; return [1, 0] },
    store: { queryNearest: async () => null, save: async () => {} },
  })
  const memory = new MemoryLayer(async ({ sessionId }) => ({
    sessionId,
    summary: '',
    extractedFacts: [],
    recentMessages: [],
  }))
  const dependencies = {
    knowledge,
    memory,
    exactCache,
    selectCompute: () => ({ provider: 'openai' as const, model: 'cheap' }),
    executeProvider: async () => {
      providerCalls += 1
      return { content: 'computed-once' }
    },
  }
  const payload = {
    taskId: 'tenant-a',
    sessionId: 'session-a',
    rawUserPrompt: 'same exact request',
    rawHistory: [],
    availableTools: [],
    requestedModel: 'cheap',
  }

  const first = await bootCOSKernel(payload, {}, dependencies)
  const second = await bootCOSKernel(payload, {}, dependencies)

  assert.equal(first.data, 'computed-once')
  assert.equal(second.data, 'computed-once')
  assert.equal(second.source, 'exact_cache')
  assert.equal(embeddings, 2)
  assert.equal(providerCalls, 1)
})

test('business rules short-circuit before embeddings and providers', async () => {
  let embeddings = 0
  let providerCalls = 0
  const knowledge = new KnowledgeLayer({
    generateEmbedding: async () => { embeddings += 1; return [1] },
    store: { queryNearest: async () => null, save: async () => {} },
  })
  const memory = new MemoryLayer(async ({ sessionId }) => ({
    sessionId,
    summary: '',
    extractedFacts: [],
    recentMessages: [],
  }))

  const result = await bootCOSKernel({
    taskId: 'tenant-a',
    sessionId: 'session-a',
    rawUserPrompt: 'ping',
    rawHistory: [],
    availableTools: [],
    requestedModel: 'cheap',
  }, {}, {
    knowledge,
    memory,
    businessRules: [pingBusinessRule],
    selectCompute: () => ({ provider: 'openai', model: 'cheap' }),
    executeProvider: async () => { providerCalls += 1; return { content: 'provider' } },
  })

  assert.equal(result.data, 'pong')
  assert.equal(result.source, 'business_rule')
  assert.equal(embeddings, 0)
  assert.equal(providerCalls, 0)
})

test('memory compaction keeps only snapshot plus recent high-fidelity turns', async () => {
  const memory = new MemoryLayer(async ({ sessionId, oldTurns }) => ({
    sessionId,
    summary: `compressed ${oldTurns.length}`,
    extractedFacts: ['fact-a'],
    recentMessages: [],
  }), 3, 2)

  const result = await memory.processMemoryLayer('s1', [
    { role: 'user', content: '1' },
    { role: 'assistant', content: '2' },
    { role: 'user', content: '3' },
    { role: 'assistant', content: '4' },
  ])

  assert.equal(result.length, 3)
  assert.match(result[0].content, /compressed 2/)
  assert.equal(result[1].content, '3')
  assert.equal(result[2].content, '4')
})

test('reasoning executes only registered local tools and commits final responses', async () => {
  const saved: KnowledgeRecord[] = []
  let providerTurn = 0
  const knowledge = new KnowledgeLayer({
    generateEmbedding: async () => [0.2, 0.8],
    store: {
      queryNearest: async () => null,
      save: async (record) => { saved.push(record) },
    },
  })
  const memory = new MemoryLayer(async ({ sessionId }) => ({
    sessionId,
    summary: '',
    extractedFacts: [],
    recentMessages: [],
  }))

  const first = await bootCOSKernel({
    taskId: 'tenant-a',
    sessionId: 'session-a',
    rawUserPrompt: 'echo hello',
    rawHistory: [],
    availableTools: [echoTool],
    requestedModel: 'cheap',
  }, {}, {
    knowledge,
    memory,
    selectCompute: () => ({ provider: 'anthropic', model: 'cheap' }),
    executeProvider: async () => {
      providerTurn += 1
      return { content: null, toolCalls: [{ id: 'call-1', name: 'echo', arguments: { value: 'hello' } }] }
    },
  })
  assert.equal(first.status, 'tool_executed')
  if (first.status === 'tool_executed') assert.equal(first.data[0].result, 'hello')
  assert.equal(saved.length, 0)
  assert.equal(providerTurn, 1)

  const final = await bootCOSKernel({
    taskId: 'tenant-a',
    sessionId: 'session-a',
    rawUserPrompt: 'answer',
    rawHistory: [],
    availableTools: [echoTool],
    requestedModel: 'cheap',
  }, {}, {
    knowledge,
    memory,
    selectCompute: () => ({ provider: 'anthropic', model: 'cheap' }),
    executeProvider: async () => ({ content: 'done' }),
  })
  assert.equal(final.status, 'completed')
  assert.equal(final.data, 'done')
  assert.equal(saved.length, 1)
})
