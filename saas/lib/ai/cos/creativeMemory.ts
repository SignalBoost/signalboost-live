import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'
import { generateLocalEmbedding } from '@/lib/ai/cos/localEmbeddings'
import { embeddingModelName } from '@/lib/ai/cos/embeddingEndpoint'
import { lexicalOverlapScore } from '@/lib/ai/cos/contextRelevance'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'

export type CreativeMemoryRow = {
  id: string
  taskType: string
  contextSummary: string
  approach: string
  usefulElements: unknown[]
  style: string | null
  constraints: unknown[]
  outcomeSummary: string | null
  qualityScore: number
  sourceKind: string
  sourceRef: string | null
  language: string
  trainingEligible: boolean
  similarity: number
}

export type CreativeMemoryRetrieval = {
  retrieved: number
  relevant: number
  selected: CreativeMemoryRow[]
  mode: 'vector' | 'task-fallback' | 'unavailable'
}

const MAX_SELECTED = 4

function safeText(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function candidateText(row: any): string {
  return [
    safeText(row.task_type, 120),
    safeText(row.context_summary, 800),
    safeText(row.approach, 1600),
    Array.isArray(row.useful_elements) ? row.useful_elements.map((value: unknown) => safeText(value, 180)).join(' ') : '',
    safeText(row.style, 240),
    Array.isArray(row.constraints) ? row.constraints.map((value: unknown) => safeText(value, 180)).join(' ') : '',
    safeText(row.outcome_summary, 600),
  ].filter(Boolean).join(' ')
}

function taskHints(prompt: string): string[] {
  const text = String(prompt || '').toLowerCase()
  const hints = new Set<string>()
  if (/\b(?:travel|trip|itinerary|layover|airport|sightsee|tour|zwiedz|podr[oó][żz]|lotnisk|viaj|viagem|aeroport|путеше|маршрут|аэропорт)\b/iu.test(text)) {
    hints.add('short_budget_city_itinerary')
  }
  if (/\b(?:translate|rewrite|rephrase|summari[sz]e|shorten|przet[lł]umacz|przeredaguj|streszcz|traduc|reescrib|resum|перевед|перепиш|суммир)\b/iu.test(text)) {
    hints.add('conversation_transformation')
  }
  const problemClass = classifyProblemClass(prompt)
  if (problemClass === 'planning and strategy' || problemClass === 'writing and content' || problemClass === 'opinion and judgment') {
    hints.add('proactive_completion')
  }
  return [...hints]
}

function mapRow(row: any, similarity = 0): CreativeMemoryRow {
  return {
    id: String(row.id || ''),
    taskType: String(row.task_type || ''),
    contextSummary: String(row.context_summary || ''),
    approach: String(row.approach || ''),
    usefulElements: Array.isArray(row.useful_elements) ? row.useful_elements : [],
    style: row.style ? String(row.style) : null,
    constraints: Array.isArray(row.constraints) ? row.constraints : [],
    outcomeSummary: row.outcome_summary ? String(row.outcome_summary) : null,
    qualityScore: Number(row.quality_score || 0),
    sourceKind: String(row.source_kind || ''),
    sourceRef: row.source_ref ? String(row.source_ref) : null,
    language: String(row.language || 'en'),
    trainingEligible: Boolean(row.training_eligible),
    similarity: Number(row.similarity ?? similarity ?? 0),
  }
}

function audienceValues(privileged: boolean): string[] {
  return privileged ? ['public', 'owner'] : ['public']
}

export async function retrieveCreativeMemory(prompt: string, options: { privileged?: boolean; limit?: number } = {}): Promise<CreativeMemoryRetrieval> {
  const db = cosServiceDb()
  if (!db) return { retrieved: 0, relevant: 0, selected: [], mode: 'unavailable' }
  const limit = Math.max(1, Math.min(MAX_SELECTED, Math.floor(options.limit ?? MAX_SELECTED)))
  const audience = options.privileged ? 'owner' : 'public'

  try {
    const vector = await generateLocalEmbedding(prompt)
    const { data, error } = await db.rpc('cos_match_creative_memory', {
      query_embedding: vector,
      match_count: Math.max(limit * 3, 8),
      min_similarity: 0.38,
      match_embedding_model: embeddingModelName(),
      match_audience: audience,
    })
    if (!error && Array.isArray(data) && data.length) {
      const rows = data.map((row: any) => mapRow(row))
      const selected = rows
        .filter(row => row.qualityScore >= 0.65)
        .sort((a, b) => b.similarity - a.similarity || b.qualityScore - a.qualityScore)
        .slice(0, limit)
      if (selected.length) return { retrieved: rows.length, relevant: selected.length, selected, mode: 'vector' }
    }
  } catch (error) {
    console.warn('[cos-creative-memory] vector retrieval unavailable; using task fallback', error)
  }

  const hints = taskHints(prompt)
  if (!hints.length) return { retrieved: 0, relevant: 0, selected: [], mode: 'task-fallback' }

  const result = await db.from('cos_creative_memory')
    .select('id,task_type,context_summary,approach,useful_elements,style,constraints,outcome_summary,quality_score,source_kind,source_ref,language,training_eligible')
    .eq('status', 'approved')
    .in('audience', audienceValues(Boolean(options.privileged)))
    .in('task_type', hints)
    .order('quality_score', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(24)

  if (result.error) {
    console.warn('[cos-creative-memory] task fallback unavailable', result.error.message)
    return { retrieved: 0, relevant: 0, selected: [], mode: 'unavailable' }
  }

  const rows = (result.data ?? []).map((row: any) => {
    const taskBoost = hints.includes(String(row.task_type)) ? 0.75 : 0
    const lexical = lexicalOverlapScore(prompt, candidateText(row))
    return mapRow(row, Math.min(1, taskBoost + lexical * 0.25))
  })
  const selected = rows
    .filter(row => row.qualityScore >= 0.65)
    .sort((a, b) => b.similarity - a.similarity || b.qualityScore - a.qualityScore)
    .slice(0, limit)

  return { retrieved: rows.length, relevant: selected.length, selected, mode: 'task-fallback' }
}

export function formatCreativeMemoryForReasoner(rows: CreativeMemoryRow[]): string[] {
  return rows.map((row, index) => {
    const elements = row.usefulElements.map(value => safeText(value, 160)).filter(Boolean).slice(0, 8)
    const constraints = row.constraints.map(value => safeText(value, 180)).filter(Boolean).slice(0, 6)
    return [
      `[CM${index + 1}] task=${safeText(row.taskType, 100)}`,
      `approach=${safeText(row.approach, 1200)}`,
      elements.length ? `useful_elements=${elements.join('; ')}` : '',
      row.style ? `style=${safeText(row.style, 220)}` : '',
      constraints.length ? `constraints=${constraints.join('; ')}` : '',
      row.outcomeSummary ? `validated_outcome=${safeText(row.outcomeSummary, 500)}` : '',
      `quality=${row.qualityScore.toFixed(2)}; similarity=${row.similarity.toFixed(2)}`,
    ].filter(Boolean).join(' | ')
  })
}

export async function rememberCreativePattern(input: {
  audience?: 'public' | 'owner'
  taskType: string
  contextSummary: string
  approach: string
  usefulElements?: string[]
  style?: string | null
  constraints?: string[]
  outcomeSummary?: string | null
  qualityScore: number
  sourceKind: string
  sourceRef: string
  language?: string
  trainingEligible?: boolean
  validated: boolean
}): Promise<{ stored: boolean; id: string; status: 'approved' | 'quarantined'; embedded: boolean; error?: string }> {
  const db = cosServiceDb()
  const normalized = [
    safeText(input.taskType, 120),
    safeText(input.contextSummary, 1000),
    safeText(input.approach, 2000),
    ...(input.usefulElements ?? []).map(value => safeText(value, 240)),
    safeText(input.style, 300),
    ...(input.constraints ?? []).map(value => safeText(value, 300)),
    safeText(input.outcomeSummary, 800),
  ].filter(Boolean).join('\n')
  const fingerprint = createHash('sha256').update(normalized.toLowerCase()).digest('hex')
  const id = `cm_${fingerprint.slice(0, 24)}`
  const status = input.validated && Number(input.qualityScore) >= 0.65 ? 'approved' : 'quarantined'
  if (!db) return { stored: false, id, status, embedded: false, error: 'COS service store is not configured' }

  let vector: number[] | null = null
  let model: string | null = null
  try {
    vector = await generateLocalEmbedding(normalized)
    model = embeddingModelName()
  } catch (error) {
    console.warn('[cos-creative-memory] embed-on-write unavailable; storing without vector', error)
  }

  const { error } = await db.from('cos_creative_memory').upsert({
    id,
    fingerprint,
    audience: input.audience ?? 'owner',
    task_type: safeText(input.taskType, 120),
    context_summary: safeText(input.contextSummary, 2000),
    approach: safeText(input.approach, 4000),
    useful_elements: (input.usefulElements ?? []).slice(0, 20),
    style: input.style ? safeText(input.style, 600) : null,
    constraints: (input.constraints ?? []).slice(0, 20),
    outcome_summary: input.outcomeSummary ? safeText(input.outcomeSummary, 1600) : null,
    quality_score: Math.max(0, Math.min(1, Number(input.qualityScore) || 0)),
    source_kind: safeText(input.sourceKind, 120),
    source_ref: safeText(input.sourceRef, 500),
    status,
    language: safeText(input.language || 'en', 12),
    training_eligible: Boolean(input.trainingEligible),
    embedding: vector,
    embedding_model: model,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'fingerprint' })

  return error
    ? { stored: false, id, status, embedded: Boolean(vector), error: error.message }
    : { stored: true, id, status, embedded: Boolean(vector) }
}

export async function backfillCreativeMemoryEmbeddings(limit = 6): Promise<{ attempted: number; embedded: number; failed: number }> {
  const db = cosServiceDb()
  if (!db) return { attempted: 0, embedded: 0, failed: 0 }
  const model = embeddingModelName()
  const result = await db.from('cos_creative_memory')
    .select('id,task_type,context_summary,approach,useful_elements,style,constraints,outcome_summary')
    .eq('status', 'approved')
    .or(`embedding.is.null,embedding_model.is.null,embedding_model.neq.${model}`)
    .order('quality_score', { ascending: false })
    .limit(Math.max(1, Math.min(12, Math.floor(limit))))

  if (result.error || !result.data?.length) return { attempted: 0, embedded: 0, failed: result.error ? 1 : 0 }

  let embedded = 0
  let failed = 0
  for (const row of result.data) {
    try {
      const vector = await generateLocalEmbedding(candidateText(row))
      const update = await db.from('cos_creative_memory')
        .update({ embedding: vector, embedding_model: model, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (update.error) throw update.error
      embedded += 1
    } catch {
      failed += 1
    }
  }
  return { attempted: result.data.length, embedded, failed }
}
