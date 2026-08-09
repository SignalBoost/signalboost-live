import type { SupabaseClient } from '@supabase/supabase-js'
import { ExactCacheLayer } from '../layers/exact-cache'
import { KnowledgeGraph, KnowledgeLayer, type EmbeddingGenerator } from '../layers/knowledge'
import { LearningEngine } from '../layers/learning'
import { MemoryLayer, withContextSummaryCache, type MemoryCompactor } from '../layers/memory'
import { cosServiceDb, createSupabaseCOSStores } from './supabase'
import { SupabaseExactCacheStore } from './exactSupabase'

export type PersistentCOSRuntimeOptions = {
  generateEmbedding: EmbeddingGenerator
  compactMemory: MemoryCompactor
  db?: SupabaseClient | null
  similarityThreshold?: number
  exactCacheTtlMs?: number | null
  maxRawTurns?: number
  highFidelityTurns?: number
  onError?: (error: unknown) => void
}

/**
 * Production composition root for Phase 2 intelligence.
 * All reusable knowledge, graph facts, summaries, learning observations, exact
 * results and ROI telemetry share the same durable COS-owned database boundary.
 */
export function createPersistentCOSRuntime(options: PersistentCOSRuntimeOptions) {
  const db = options.db === undefined ? cosServiceDb() : options.db
  if (!db) return null

  const stores = createSupabaseCOSStores(db)
  if (!stores) return null

  const knowledge = new KnowledgeLayer({
    generateEmbedding: options.generateEmbedding,
    store: stores.knowledge,
    similarityThreshold: options.similarityThreshold,
    onError: options.onError,
  })

  const compactMemory = withContextSummaryCache(
    options.compactMemory,
    stores.summaries,
    options.onError,
  )

  return {
    knowledge,
    knowledgeGraph: new KnowledgeGraph(stores.knowledge),
    learning: new LearningEngine(stores.learning),
    memory: new MemoryLayer(
      compactMemory,
      options.maxRawTurns ?? 6,
      options.highFidelityTurns ?? 2,
    ),
    exactCache: new ExactCacheLayer(
      new SupabaseExactCacheStore(db),
      { ttlMs: options.exactCacheTtlMs ?? null, onError: options.onError },
    ),
    roiMetrics: stores.roi,
  }
}
