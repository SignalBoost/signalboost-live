import assert from 'node:assert/strict'
import test from 'node:test'
import { SupabaseKnowledgeStore } from '../lib/cos-core/storage/supabase'
import { knowledgeFactEmbeddingText } from '../lib/ai/cos/knowledgeFactSemantic'
import type { KnowledgeFact } from '../lib/cos-core/layers/knowledge/persistent'

const fact: KnowledgeFact = {
  id: 'fact-1',
  taskId: 'continuous-learning',
  subject: 'PostgreSQL query plans',
  predicate: 'can_change_after',
  object: 'statistics refresh changes cardinality estimates',
  confidence: 0.91,
  source: 'https://example.test/source',
  updatedAt: new Date('2026-08-12T00:00:00.000Z'),
}

test('knowledge fact embedding text includes the complete semantic claim', () => {
  assert.equal(
    knowledgeFactEmbeddingText(fact),
    'PostgreSQL query plans\ncan_change_after\nstatistics refresh changes cardinality estimates',
  )
})

test('SupabaseKnowledgeStore writes an embedding when one is supplied', async () => {
  const calls: any[] = []
  const db = {
    from(table: string) {
      return {
        async upsert(payload: unknown, options: unknown) {
          calls.push({ table, payload, options })
          return { error: null }
        },
      }
    },
  }
  const store = new SupabaseKnowledgeStore(db as any)
  await store.upsertFact(fact, [0.1, 0.2, 0.3])

  assert.equal(calls.length, 1)
  assert.equal(calls[0].table, 'cos_knowledge_facts')
  assert.deepEqual(calls[0].payload.embedding, [0.1, 0.2, 0.3])
  assert.equal(calls[0].payload.subject, fact.subject)
})

test('SupabaseKnowledgeStore maps semantic fact matches and passes bounded RPC options', async () => {
  const calls: any[] = []
  const db = {
    async rpc(name: string, args: unknown) {
      calls.push({ name, args })
      return {
        error: null,
        data: [{
          id: fact.id,
          task_id: fact.taskId,
          subject: fact.subject,
          predicate: fact.predicate,
          object: fact.object,
          confidence: fact.confidence,
          source: fact.source,
          updated_at: fact.updatedAt.toISOString(),
          similarity: 0.82,
        }],
      }
    },
  }
  const store = new SupabaseKnowledgeStore(db as any)
  const matches = await store.queryNearestFacts([0.4, 0.5], { matchCount: 500, minSimilarity: 2 })

  assert.equal(calls[0].name, 'cos_match_knowledge_facts')
  assert.equal(calls[0].args.match_count, 50)
  assert.equal(calls[0].args.min_similarity, 1)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].similarityScore, 0.82)
  assert.equal(matches[0].subject, fact.subject)
})
