import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  ENTERPRISE_MEMORY_DEFINITION,
  MEMORY_LAYER_COMPARISON_GUARDRAIL,
  SEMANTIC_ANSWER_CACHE_DEFINITION,
} from '../lib/ai/cos/cosMemoryLayerDefinitions.ts'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('canonical definitions keep Enterprise Memory distinct from Semantic Cache', () => {
  assert.match(ENTERPRISE_MEMORY_DEFINITION, /durable organization-scoped operational knowledge/)
  assert.match(ENTERPRISE_MEMORY_DEFINITION, /not an answer cache/)
  assert.match(SEMANTIC_ANSWER_CACHE_DEFINITION, /previously generated answer/)
  assert.match(SEMANTIC_ANSWER_CACHE_DEFINITION, /Embeddings are only the retrieval index/)
  assert.match(SEMANTIC_ANSWER_CACHE_DEFINITION, /must never be reused through an unscoped cache entry/)
})

test('reasoner prompt source scopes diagnostic rules and imports canonical definitions', () => {
  const promptSource = source('../lib/ai/cos/cosFirstAnswerEnterprise.ts')
  assert.match(promptSource, /ENTERPRISE_MEMORY_DEFINITION/)
  assert.match(promptSource, /SEMANTIC_ANSWER_CACHE_DEFINITION/)
  assert.match(promptSource, /MEMORY_LAYER_COMPARISON_GUARDRAIL/)
  assert.match(promptSource, /For diagnostic or troubleshooting questions, every cause/)
  assert.match(promptSource, /Examples in this prompt illustrate answer quality only/)
  assert.doesNotMatch(promptSource, /pg_stat_activity wait_event distribution/)
})

test('verified platform self-knowledge source seeds both authoritative definitions', () => {
  const selfKnowledgeSource = source('../lib/ai/cos/platformSelfKnowledge.ts')
  assert.match(selfKnowledgeSource, /ENTERPRISE_MEMORY_DEFINITION/)
  assert.match(selfKnowledgeSource, /SEMANTIC_ANSWER_CACHE_DEFINITION/)
  assert.match(selfKnowledgeSource, /SignalBoost COS Enterprise Memory/)
  assert.match(selfKnowledgeSource, /SignalBoost COS Semantic Cache/)
  assert.match(selfKnowledgeSource, /confidence: 1/)
})
