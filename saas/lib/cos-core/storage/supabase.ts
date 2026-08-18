import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CachedResponse, KnowledgeRecord } from '../layers/knowledge/index.ts'
import type { KnowledgeFact, KnowledgeFactMatch, SemanticKnowledgeStore } from '../layers/knowledge/persistent.ts'
import type { ContextSummaryStore, CompressedMemorySnapshot } from '../layers/memory/index.ts'
import type { ContinuousLearningStore, LearningCandidate, LearningObservation, LearningStore, LearnedStrategy } from '../layers/learning/index.ts'
import type { AIROIMetric, AIROIMetricsSink } from '../layers/optimization/index.ts'

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

  async queryExact(options: { taskId: string; prompt: string }): Promise<CachedResponse | null> {
    const { data, error } = await this.db.from('cos_knowledge_records')
      .select('prompt_text,context_text,response_data')
      .eq('task_id', options.taskId)
      .eq('prompt_text', options.prompt)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? {
      taskId: options.taskId,
      originalPrompt: String(data.prompt_text ?? ''),
      contextText: String(data.context_text ?? ''),
      responsePayload: data.response_data,
      similarityScore: 1,
    } : null
  }

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

  async upsertFact(fact: KnowledgeFact, embeddingVector?: number[]): Promise<void> {
    const payload: Record<string, unknown> = {
      id: fact.id,
      task_id: fact.taskId,
      subject: fact.subject,
      predicate: fact.predicate,
      object: fact.object,
      confidence: fact.confidence,
      source: fact.source,
      updated_at: fact.updatedAt.toISOString(),
    }
    if (embeddingVector?.length) payload.embedding = embeddingVector
    const { error } = await this.db.from('cos_knowledge_facts').upsert(payload, { onConflict: 'task_id,subject,predicate' })
    if (error) throw error
  }

  async findFacts(taskId: string, subjects: string[]): Promise<KnowledgeFact[]> {
    if (!subjects.length) return []
    const { data, error } = await this.db.from('cos_knowledge_facts').select('*').eq('task_id', taskId).in('subject', subjects)
    if (error) throw error
    return (data ?? []).map(mapFact)
  }

  async queryNearestFacts(vector: number[], options: { matchCount?: number; minSimilarity?: number } = {}): Promise<KnowledgeFactMatch[]> {
    const { data, error } = await this.db.rpc('cos_match_knowledge_facts', {
      query_embedding: vector,
      match_count: Math.max(1, Math.min(50, Math.floor(options.matchCount ?? 16))),
      min_similarity: Math.max(0, Math.min(1, options.minSimilarity ?? 0.55)),
    })
    if (error) throw error
    return (data ?? []).map((row: any) => ({
      ...mapFact(row),
      similarityScore: Number(row.similarity),
    }))
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

export class SupabaseContinuousLearningStore implements ContinuousLearningStore {
  constructor(private readonly db: SupabaseClient) {}

  async hasContent(contentHash: string): Promise<boolean> {
    const { data, error } = await this.db.from('cos_continuous_learning').select('content_hash')
      .eq('content_hash', contentHash).maybeSingle()
    if (error) throw error
    return Boolean(data)
  }

  async remember(candidate: LearningCandidate): Promise<void> {
    const { error } = await this.db.from('cos_continuous_learning').insert({
      content_hash: candidate.contentHash,
      source_kind: candidate.sourceKind,
      source_uri: candidate.sourceUri,
      source_title: candidate.sourceTitle ?? null,
      observed_at: candidate.observedAt,
      subject: candidate.subject,
      summary: candidate.summary,
      facts: candidate.facts,
      confidence: candidate.confidence,
      license: candidate.license ?? null,
      evidence: candidate.evidence,
    })
    if (error) throw error
  }

  async rememberProbationary(candidate: LearningCandidate): Promise<boolean> {
    const admission = candidate.admission
    if (!admission || admission.tier !== 'probationary') return false
    const normalizedClaim = `${candidate.subject}\n${candidate.facts.map(fact => `${fact.predicate}\n${fact.object}`).join('\n')}`
      .toLowerCase().replace(/\s+/g, ' ').trim()
    const claimFingerprint = createHash('sha256').update(normalizedClaim).digest('hex')
    const { data: existing, error: existingError } = await this.db
      .from('cos_learning_probationary')
      .select('*')
      .eq('claim_fingerprint', claimFingerprint)
      .eq('status', 'probationary')
      .neq('source_uri', candidate.sourceUri)
      .limit(20)
    if (existingError) throw existingError

    const now = new Date().toISOString()
    const row = {
      content_hash: candidate.contentHash, claim_fingerprint: claimFingerprint,
      source_kind: candidate.sourceKind, source_uri: candidate.sourceUri, source_title: candidate.sourceTitle ?? null,
      observed_at: candidate.observedAt, subject: candidate.subject, summary: candidate.summary, facts: candidate.facts,
      confidence: candidate.confidence, raw_relevance: admission.rawRelevance, gap_adjusted_relevance: admission.gapAdjustedRelevance,
      source_floor: admission.sourceFloor, gap_aligned: admission.gapAligned, corroboration_required: admission.corroborationRequired,
      admission_reason: admission.reason, status: 'probationary', license: candidate.license ?? null, evidence: candidate.evidence,
    }
    const mustPromote = admission.gapAligned || Boolean(existing?.length)
    const { error: storedError } = await this.db.from('cos_learning_probationary').upsert(
      mustPromote ? { ...row, status: 'promoted', promoted_at: now } : row,
      { onConflict: 'content_hash' },
    )
    if (storedError) throw storedError
    if (!mustPromote) return false

    const promoted = [...(existing ?? []), { ...row, status: 'promoted', promoted_at: now }]
    for (const item of promoted) {
      const { error } = await this.db.from('cos_continuous_learning').upsert({
        content_hash: item.content_hash, source_kind: item.source_kind, source_uri: item.source_uri, source_title: item.source_title,
        observed_at: item.observed_at, subject: item.subject, summary: item.summary, facts: item.facts, confidence: item.confidence,
        license: item.license, evidence: item.evidence,
      }, { onConflict: 'content_hash' })
      if (error) throw error
    }
    if (existing?.length) {
      const { error } = await this.db.from('cos_learning_probationary').update({ status: 'promoted', promoted_at: now })
        .eq('claim_fingerprint', claimFingerprint).eq('status', 'probationary')
      if (error) throw error
    }
    return true
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
    continuousLearning: new SupabaseContinuousLearningStore(db),
    roi: new SupabaseAIROIMetricsSink(db),
  }
}
