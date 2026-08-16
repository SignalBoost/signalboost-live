import assert from 'node:assert/strict'
import test from 'node:test'

import { COS_REASONER_SYSTEM_PROMPT } from '../lib/ai/cos/cosFirstAnswerEnterprise.ts'
import {
  ENTERPRISE_MEMORY_DEFINITION,
  MEMORY_LAYER_COMPARISON_GUARDRAIL,
  SEMANTIC_ANSWER_CACHE_DEFINITION,
} from '../lib/ai/cos/cosMemoryLayerDefinitions.ts'
import { platformSelfKnowledgeFacts } from '../lib/ai/cos/platformSelfKnowledge.ts'

test('canonical definitions keep Enterprise Memory distinct from Semantic Cache', () => {
  assert.match(ENTERPRISE_MEMORY_DEFINITION, /durable organization-scoped operational knowledge/)
  assert.match(ENTERPRISE_MEMORY_DEFINITION, /not an answer cache/)
  assert.match(SEMANTIC_ANSWER_CACHE_DEFINITION, /previously generated answer/)
  assert.match(SEMANTIC_ANSWER_CACHE_DEFINITION, /Embeddings are only the retrieval index/)
  assert.match(SEMANTIC_ANSWER_CACHE_DEFINITION, /must never be reused through an unscoped cache entry/)
})

test('reasoner prompt scopes diagnostic rules and carries canonical memory definitions', () => {
  const prompt = COS_REASONER_SYSTEM_PROMPT('English')
  assert.ok(prompt.includes(ENTERPRISE_MEMORY_DEFINITION))
  assert.ok(prompt.includes(SEMANTIC_ANSWER_CACHE_DEFINITION))
  assert.ok(prompt.includes(MEMORY_LAYER_COMPARISON_GUARDRAIL))
  assert.doesNotMatch(prompt, /pg_stat_activity wait_event distribution/)
})

test('verified platform self-knowledge seeds both authoritative definitions', () => {
  const facts = platformSelfKnowledgeFacts(new Date('2026-08-16T00:00:00.000Z'))
  const enterprise = facts.find(fact => fact.subject === 'SignalBoost COS Enterprise Memory')
  const cache = facts.find(fact => fact.subject === 'SignalBoost COS Semantic Cache')
  assert.equal(enterprise?.object, ENTERPRISE_MEMORY_DEFINITION)
  assert.equal(cache?.object, SEMANTIC_ANSWER_CACHE_DEFINITION)
  assert.equal(enterprise?.confidence, 1)
  assert.equal(cache?.confidence, 1)
})
