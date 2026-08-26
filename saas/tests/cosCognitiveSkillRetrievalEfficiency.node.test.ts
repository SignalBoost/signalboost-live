import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('cognitive skill retrieval reuses stable candidate embeddings but keeps each query fresh', () => {
  const context = read('../lib/ai/cos/cognitiveSkillContext.ts')
  const ranking = read('../lib/ai/cos/cognitiveSkillRanking.ts')

  assert.match(context, /rankCognitiveSkillCandidates/)
  assert.doesNotMatch(context, /rankContextCandidates/)
  assert.match(ranking, /LOCAL_AI_EMBEDDING_MODEL/)
  assert.match(ranking, /candidateEmbeddingCache/)
  assert.match(ranking, /MAX_CACHED_SKILL_EMBEDDINGS = 128/)
  assert.match(ranking, /const embeddingInputs = \[query, \.\.\.missingIndexes/)
  assert.match(ranking, /generateLocalEmbeddings\(embeddingInputs\)/)
  assert.match(ranking, /const queryVector = vectors\[0\]/)
})

test('cognitive embedding reuse preserves the existing domain gate, threshold ranking and fail-closed fallback', () => {
  const context = read('../lib/ai/cos/cognitiveSkillContext.ts')
  const ranking = read('../lib/ai/cos/cognitiveSkillRanking.ts')

  const domainGate = ranking.indexOf('domainCompatibleContext(query, candidate.text)')
  const embeddingCall = ranking.indexOf('generateLocalEmbeddings(embeddingInputs)')
  assert.ok(domainGate > 0)
  assert.ok(embeddingCall > domainGate, 'domain filtering must happen before embedding work')

  assert.match(ranking, /cognitive_skill_candidate_embedding_missing/)
  assert.match(ranking, /cosineSimilarity\(queryVector/)
  assert.match(ranking, /candidate\.similarity >= options\.threshold/)
  assert.match(ranking, /lexicalFallback\(query, domainCandidates, options\.limit\)/)
  assert.match(context, /COS_COGNITIVE_SKILL_SIMILARITY_THRESHOLD \|\| '0\.55'/)
  assert.match(context, /\.in\('status', \['validated', 'learned', 'mastered'\]\)/)
})

test('candidate cache is model-aware and bounded so stale embedding spaces cannot be mixed indefinitely', () => {
  const ranking = read('../lib/ai/cos/cognitiveSkillRanking.ts')
  assert.match(ranking, /return `\$\{embeddingModelIdentity\(\)\}\\u0000\$\{text\}`/)
  assert.match(ranking, /while \(candidateEmbeddingCache\.size > MAX_CACHED_SKILL_EMBEDDINGS\)/)
  assert.match(ranking, /candidateEmbeddingCache\.delete\(oldest\)/)
})
