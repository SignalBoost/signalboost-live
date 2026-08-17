import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

import {
  ENTERPRISE_MEMORY_DEFINITION,
  MEMORY_LAYER_COMPARISON_GUARDRAIL,
  SEMANTIC_ANSWER_CACHE_DEFINITION,
} from '../lib/ai/cos/cosMemoryLayerDefinitions.ts'
import { platformSelfKnowledgeFacts } from '../lib/ai/cos/platformSelfKnowledge.ts'

const reasonerSource = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')

test('canonical definitions keep Enterprise Memory distinct from Semantic Cache', () => {
  assert.match(ENTERPRISE_MEMORY_DEFINITION, /durable organization-scoped operational knowledge/)
  assert.match(ENTERPRISE_MEMORY_DEFINITION, /not an answer cache/)
  assert.match(SEMANTIC_ANSWER_CACHE_DEFINITION, /previously generated answer/)
  assert.match(SEMANTIC_ANSWER_CACHE_DEFINITION, /Embeddings are only the retrieval index/)
  assert.match(SEMANTIC_ANSWER_CACHE_DEFINITION, /must never be reused through an unscoped cache entry/)
})

test('reasoner source scopes diagnostic rules and carries canonical memory definitions', () => {
  assert.match(reasonerSource, /ENTERPRISE_MEMORY_DEFINITION/)
  assert.match(reasonerSource, /SEMANTIC_ANSWER_CACHE_DEFINITION/)
  assert.match(reasonerSource, /MEMORY_LAYER_COMPARISON_GUARDRAIL/)
  assert.match(reasonerSource, /For diagnostic or troubleshooting questions/)
  assert.doesNotMatch(reasonerSource, /pg_stat_activity wait_event distribution/)
})

test('verified platform self-knowledge seeds both authoritative definitions', () => {
  const facts = platformSelfKnowledgeFacts(new Date('2026-08-17T00:00:00.000Z'))
  const enterprise = facts.find(fact => fact.subject === 'SignalBoost COS Enterprise Memory')
  const cache = facts.find(fact => fact.subject === 'SignalBoost COS Semantic Cache')
  assert.equal(enterprise?.object, ENTERPRISE_MEMORY_DEFINITION)
  assert.equal(cache?.object, SEMANTIC_ANSWER_CACHE_DEFINITION)
  assert.equal(enterprise?.confidence, 1)
  assert.equal(cache?.confidence, 1)
})

test('comparison guardrail explicitly excludes diagnostic artifacts from conceptual answers', () => {
  assert.match(MEMORY_LAYER_COMPARISON_GUARDRAIL, /Do not force incident-diagnostic observables/)
})
