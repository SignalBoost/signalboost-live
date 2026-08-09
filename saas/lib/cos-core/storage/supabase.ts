import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CachedResponse, KnowledgeRecord } from '../layers/knowledge'
import type { KnowledgeFact, SemanticKnowledgeStore } from '../layers/knowledge/persistent'
import type { ContextSummaryStore, CompressedMemorySnapshot } from '../layers/memory'
import type { LearningObservation, LearningStore, LearnedStrategy } from '../layers/learning'
import type { AIROIMetric, AIROIMetricsSink } from '../layers/optimization'

let singleton: SupabaseClient | null | undefined

export function cosServiceDb(): SupabaseClient | null {
  if (singleton !== undefined) return singleton
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  singleton = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return singleton
}

export class SupabaseKnowledgeStore implements SemanticKnowledgeStore {
  constructor(private readonly db: SupabaseClient) {}

  async queryNearest(vector: number[], options: { taskId: string }): Promise<CachedResponse | null> {
    const { data, error } = await this.db.rpc('cos_match_knowledge', {
      query_embedding: vector,
      match_task_id: options.taskId,
      match_count: 1,
    })
    if (error) throw error
    const row = data?.[0]
    return row ? {
      taskId: options.taskId,
      originalPrompt: String(row.prompt_text ?? ''),
      responsePayload: row.response_data,
      similarityScore: Number(row.similarity),
    } : null
  }

  async save(record: KnowledgeRecord): Promise<void> {
    const { error } = await this.db.from('cos_knowledge_records').insert({
      task_id: record.taskId,
      prompt_text: record.promptText,
      context_text: record.contextText,
      embedding: record.embeddingVector,
      response_data: record.responseData,
      created_at: record.createdAt.toISOString(),
    })
    if (error) throw error
  }

  async getFact(taskId: string, subject: string, predicate: string): Promise<KnowledgeFact | null> {
    const { data, error } = await this.db.from('cos_knowledge_facts').select('*')
      .eq('task_id', taskId).eq('subject', subject).eq('predicate', predicate).maybeSingle()
    if (error) throw error
    return data ? mapFact(data) : null
  }

  async upsertFact(fact: KnowledgeFact): Promise<void> {
    const { error } = await this.db.from('cos_knowledge_facts').upsert({
      id: fact.id, task_id: fact.taskId, subject: fact.subject, predicate: fact.predicate,
      object: fact.object, confidence: fact.confidence, source: fact.source, updated_at: fact.updatedAt.toISOString(),
    }, { onConflict: 'task_id,subject,predicate' })
    if (error) throw error
  }

  async findFacts(taskId: string, subjects: string[]): Promise<KnowledgeFact[]> {
    if (!subjects.length) return []
    const { data, error } = await this.db.from('cos_knowledge_facts').select('*').eq('task_id', taskId).in('subject', subjects)
    if (error) throw error
    return (data ?? []).map(mapFact)
  }
}

function mapFact(row: any): KnowledgeFact {
  return { id: row.id, taskId: row.task_id, subject: row.subject, predicate: row.predicate, object: row.object,
    confidence: Number(row.confidence), source: row.source, updatedAt: new Date(row.updated_at) }
}

export class SupabaseContextSummaryStore implements ContextSummaryStore {
  constructor(private readonly db: SupabaseClient) {}
  async get(key: string): Promise<CompressedMemorySnapshot | null> {
    const { data, error } = await this.db.from('cos_context_summaries').select('summary').eq('cache_key', key).maybeSingle()
    if (error) throw error
    return data?.summary ?? null
  }
  async set(key: string, snapshot: CompressedMemorySnapshot): Promise<void> {
    const { error } = await this.db.from('cos_context_summaries').upsert({ cache_key: key, summary: snapshot })
    if (error) throw error
  }
}

export class SupabaseLearningStore implements LearningStore {
  constructor(private readonly db: SupabaseClient) {}
  async observe(o: LearningObservation): Promise<void> {
    const { error } = await this.db.from('cos_learning_observations').insert({
      task_id: o.taskId, capability: o.capability, strategy: o.strategy, succeeded: o.succeeded,
      latency_ms: o.latencyMs, external_cost_usd: o.externalCostUsd, reusable: o.reusable,
    })
    if (error) throw error
  }
  async bestStrategy(taskId: string, capability: string): Promise<LearnedStrategy | null> {
    const { data, error } = await this.db.from('cos_learning_observations').select('strategy,succeeded,latency_ms,external_cost_usd')
      .eq('task_id', taskId).eq('capability', capability).limit(500)
    if (error) throw error
    if (!data?.length) return null
    const grouped = new Map<string, { score: number; n: number }>()
    for (const row of data) {
      const current = grouped.get(row.strategy) ?? { score: 0, n: 0 }
      const success = row.succeeded ? 1 : 0
      const efficiency = 1 / (1 + Number(row.external_cost_usd || 0) * 100 + Number(row.latency_ms || 0) / 10000)
      current.score += success * efficiency; current.n += 1; grouped.set(row.strategy, current)
    }
    const best = [...grouped.entries()].map(([strategy, x]) => ({ strategy, score: x.score / x.n, observations: x.n }))
      .sort((a, b) => b.score - a.score)[0]
    return best ? { capability, ...best } : null
  }
}

export class SupabaseAIROIMetricsSink implements AIROIMetricsSink {
  constructor(private readonly db: SupabaseClient) {}
  async record(m: AIROIMetric): Promise<void> {
    const { error } = await this.db.from('cos_ai_roi_metrics').insert({
      task_id: m.taskId, source: m.source, provider_calls: m.providerCalls,
      estimated_provider_cost_usd: m.estimatedProviderCostUsd, estimated_cost_avoided_usd: m.estimatedCostAvoidedUsd,
      prompt_characters_before: m.promptCharactersBefore, prompt_characters_after: m.promptCharactersAfter, latency_ms: m.latencyMs,
    })
    if (error) throw error
  }
}

export function createSupabaseCOSStores(db = cosServiceDb()) {
  if (!db) return null
  return {
    knowledge: new SupabaseKnowledgeStore(db),
    summaries: new SupabaseContextSummaryStore(db),
    learning: new SupabaseLearningStore(db),
    roi: new SupabaseAIROIMetricsSink(db),
  }
}
