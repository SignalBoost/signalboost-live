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
  assert.match(ranking, /cachedCandidateEmbeddings/)
  assert.match(ranking, /candidateEmbeddingsRequested/)
  assert.match(ranking, /embeddingInputsSent/)
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

test('runtime efficiency telemetry is prompt-free and measures cache hits plus retrieval latency', () => {
  const context = read('../lib/ai/cos/cognitiveSkillContext.ts')
  assert.match(context, /cos-cognitive-skill-retrieval-efficiency-v1/)
  assert.match(context, /candidateCacheHitRate/)
  assert.match(context, /candidateEmbeddingsAvoided/)
  assert.match(context, /skillStoreMs/)
  assert.match(context, /dependencyHealthMs/)
  assert.match(context, /rankingMs/)
  assert.match(context, /totalMs/)
  assert.match(context, /\[cos-cognitive-skill-retrieval\]/)

  const telemetryBlock = context.slice(
    context.indexOf('type CognitiveSkillRetrievalTelemetry'),
    context.indexOf('function safe'),
  )
  assert.doesNotMatch(telemetryBlock, /^\s*(prompt|query|text|skillKey|subject|title|description|procedure)\s*:/im)

  const emitterBlock = context.slice(
    context.indexOf('function emitRetrievalTelemetry'),
    context.indexOf('/**\n * Live procedural retrieval'),
  )
  assert.match(emitterBlock, /JSON\.stringify\(telemetry\)/)
  assert.doesNotMatch(emitterBlock, /JSON\.stringify\([^)]*(prompt|query|text|skillKey|subject|title|description|procedure)/i)
})
