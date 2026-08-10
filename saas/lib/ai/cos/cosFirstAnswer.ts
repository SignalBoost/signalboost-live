import { callLocalModel } from '@/lib/ai/local-inference'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { ContinuousLearningCycle } from '@/lib/cos-core/layers/learning/cycle'
import {
  ContinuousLearningDirector,
  type ContinuousLearningPolicy,
  type KnowledgeGap,
} from '@/lib/cos-core/layers/learning'
import { createLiveLearningAdapters } from '@/lib/cos-core/layers/learning/liveSources'
import { cosServiceDb, createSupabaseCOSStores } from '@/lib/cos-core/storage/supabase'

export type COSFirstAnswerResult =
  | {
      handled: true
      reply: string
      confidence: number
      provenance: {
        responseSource: 'local_cos_reasoning'
        externalAiInvoked: false
        localModelInvoked: true
        autonomousResearchInvoked: boolean
        knowledgeNewlyRetained: number
        internalSystemsConsulted: string[]
        knowledgeFactsUsed: number
        learnedItemsUsed: number
        userMemoriesUsed: number
      }
    }
  | {
      handled: false
      confidence: number
      reason: string
      provenance: {
        responseSource: 'external_fallback_required'
        externalAiInvoked: false
        localModelInvoked: boolean
        autonomousResearchInvoked: boolean
        knowledgeNewlyRetained: number
        internalSystemsConsulted: string[]
        knowledgeFactsUsed: number
        learnedItemsUsed: number
        userMemoriesUsed: number
      }
    }

type COSFallbackProvenance = Extract<COSFirstAnswerResult, { handled: false }>['provenance']
type InternalContext = Awaited<ReturnType<typeof retrieveInternalContext>>

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'being', 'could', 'does', 'from', 'have', 'into',
  'more', 'most', 'should', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'what',
  'when', 'where', 'which', 'while', 'with', 'would', 'your', 'you', 'and', 'the', 'for', 'are', 'how', 'why',
])

const ZERO_LLM_INLINE_RESEARCH_POLICY: ContinuousLearningPolicy = {
  allowedSourceKinds: new Set([
    'official_documentation',
    'research_paper',
    'scientific_journal',
    'library_material',
    'news_article',
    'public_dataset',
    'video_transcript',
    'approved_public_web',
  ]),
  minimumConfidence: 0.72,
  maxCandidatesPerCycle: 12,
  maxExternalCostUsdPerCycle: 0,
}

function configured(): boolean {
  return process.env.COS_LOCAL_FIRST_ENABLED !== 'false'
    && Boolean(process.env.LOCAL_AI_BASE_URL?.trim())
    && Boolean(process.env.LOCAL_AI_MODEL?.trim())
}

function inlineResearchEnabled(): boolean {
  return process.env.COS_INLINE_RESEARCH_ENABLED !== 'false'
    && process.env.COS_LIVE_SOURCES_ENABLED === 'true'
}

function threshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function queryTerms(prompt: string): string[] {
  return [...new Set(
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4 && !STOP_WORDS.has(part)),
  )].slice(0, 6)
}

function subjectFromPrompt(prompt: string): string {
  return queryTerms(prompt).slice(0, 4).join(' ') || 'general reasoning'
}

function safeText(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function recordKnowledgeGap(prompt: string, confidence: number, reason: string): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  try {
    const subject = subjectFromPrompt(prompt)
    const question = safeText(prompt, 2000)
    const capability = 'general_reasoning'
    const existing = await db.from('cos_learning_gaps')
      .select('id,repeated_count')
      .eq('task_id', 'support')
      .eq('subject', subject)
      .eq('question', question)
      .eq('capability', capability)
      .maybeSingle()

    if (existing.data?.id) {
      await db.from('cos_learning_gaps').update({
        confidence,
        escalation_reason: safeText(reason, 1000),
        repeated_count: Number(existing.data.repeated_count || 1) + 1,
        status: 'pending',
        last_seen_at: new Date().toISOString(),
        resolved_at: null,
      }).eq('id', existing.data.id)
      return
    }

    await db.from('cos_learning_gaps').insert({
      task_id: 'support',
      subject,
      question,
      capability,
      confidence,
      escalation_reason: safeText(reason, 1000),
      repeated_count: 1,
      status: 'pending',
      last_seen_at: new Date().toISOString(),
    })
  } catch {
    // Gap persistence is best-effort during migrations and must never break a live answer.
  }
}

async function resolveKnowledgeGap(prompt: string): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  try {
    await db.from('cos_learning_gaps').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
      .eq('task_id', 'support')
      .eq('question', safeText(prompt, 2000))
      .eq('capability', 'general_reasoning')
      .in('status', ['pending', 'learning', 'failed'])
  } catch {
    // Best-effort only.
  }
}

async function retrieveInternalContext(prompt: string, userId?: string | null) {
  const systems = ['semantic/exact cache preflight']
  const facts: string[] = []
  const learned: string[] = []
  const memories: string[] = []
  const terms = queryTerms(prompt)
  const db = cosServiceDb()

  if (db && terms.length) {
    systems.push('Enterprise Memory / Knowledge Graph')
    systems.push('Continuous Learning Corpus')

    const factFilters = terms.flatMap((term) => [
      `subject.ilike.%${term}%`,
      `predicate.ilike.%${term}%`,
      `object.ilike.%${term}%`,
    ]).join(',')
    const learnedFilters = terms.flatMap((term) => [
      `subject.ilike.%${term}%`,
      `summary.ilike.%${term}%`,
    ]).join(',')

    const [factResult, learnedResult] = await Promise.allSettled([
      db.from('cos_knowledge_facts')
        .select('subject,predicate,object,confidence,source,updated_at')
        .or(factFilters)
        .order('confidence', { ascending: false })
        .limit(16),
      db.from('cos_continuous_learning')
        .select('subject,summary,facts,confidence,source_kind,source_uri,observed_at')
        .or(learnedFilters)
        .order('confidence', { ascending: false })
        .limit(12),
    ])

    if (factResult.status === 'fulfilled' && !factResult.value.error) {
      for (const row of factResult.value.data ?? []) {
        facts.push(`${safeText(row.subject, 180)} — ${safeText(row.predicate, 120)} — ${safeText(row.object, 600)} [confidence ${Number(row.confidence || 0).toFixed(2)}; source ${safeText(row.source, 180)}]`)
      }
    }

    if (learnedResult.status === 'fulfilled' && !learnedResult.value.error) {
      for (const row of learnedResult.value.data ?? []) {
        const extractedFacts = Array.isArray(row.facts) ? row.facts.slice(0, 4).map((fact: unknown) => safeText(fact, 300)).join('; ') : ''
        learned.push(`${safeText(row.subject, 180)}: ${safeText(row.summary, 800)}${extractedFacts ? ` Facts: ${extractedFacts}` : ''} [confidence ${Number(row.confidence || 0).toFixed(2)}; ${safeText(row.source_kind, 80)} ${safeText(row.source_uri, 280)}]`)
      }
    }
  }

  if (userId) {
    systems.push('User Enterprise Memory')
    const loaded = await loadUserMemories(userId).catch(() => [])
    for (const item of loaded.slice(-20)) memories.push(`[${item.kind}] ${safeText(item.content, 500)}`)
  }

  return { systems: [...new Set(systems)], facts, learned, memories }
}

function parseLocalResult(raw: string): { answer: string; confidence: number } | null {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as { answer?: unknown; confidence?: unknown }
    const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
    const confidence = Number(parsed.confidence)
    if (!answer || !Number.isFinite(confidence)) return null
    return { answer, confidence: Math.max(0, Math.min(1, confidence)) }
  } catch {
    return null
  }
}

function internalPrompt(context: InternalContext): string {
  return [
    context.facts.length ? `KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}` : '',
    context.learned.length ? `CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}` : '',
    context.memories.length ? `USER ENTERPRISE MEMORY:\n${context.memories.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

async function localAttempt(input: {
  prompt: string
  language?: string
  context: InternalContext
}): Promise<{ answer: string; confidence: number } | null> {
  const raw = await callLocalModel({
    temperature: 0.15,
    maxTokens: 3000,
    systemPrompt: `You are COS, SignalBoost's local, provider-independent reasoning engine. You are the PRIMARY reasoning layer, not a wrapper around a cloud model. Reason carefully from the user's question, your local model knowledge, and the supplied internal evidence. Distinguish evidence from inference. Never invent having consulted a source that is not present. If evidence is insufficient, lower confidence instead of bluffing. Reply in ${input.language || 'English'}. Return ONLY strict JSON with this shape: {"answer":"complete answer","confidence":0.0}.`,
    prompt: `${internalPrompt(input.context) || 'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`,
  }).catch(() => null)

  if (!raw) return null
  const parsed = parseLocalResult(raw)
  if (!parsed) return null
  const evidenceCount = input.context.facts.length + input.context.learned.length
  const evidenceCeiling = evidenceCount >= 5 ? 0.96 : evidenceCount >= 2 ? 0.90 : evidenceCount === 1 ? 0.84 : 0.78
  return { answer: parsed.answer, confidence: Math.min(parsed.confidence, evidenceCeiling) }
}

async function runInlineResearch(prompt: string): Promise<{ attempted: boolean; accepted: number }> {
  if (!inlineResearchEnabled()) return { attempted: false, accepted: 0 }
  const store = createSupabaseCOSStores()?.continuousLearning
  const adapters = createLiveLearningAdapters()
  if (!store || !adapters.length) return { attempted: false, accepted: 0 }

  const gap: KnowledgeGap = {
    id: `inline-support-${Date.now()}`,
    subject: subjectFromPrompt(prompt),
    question: safeText(prompt, 2000),
    portableIds: [],
    expectedReuse: 5,
    expectedAvoidedCostUsd: 0.05,
    urgency: 85,
    evidence: ['COS local reasoning requested bounded research before any external-model fallback.'],
  }

  try {
    const director = new ContinuousLearningDirector(store, ZERO_LLM_INLINE_RESEARCH_POLICY)
    const cycle = new ContinuousLearningCycle(director, adapters)
    const result = await cycle.run([gap], 0)
    return { attempted: true, accepted: result.accepted }
  } catch {
    return { attempted: true, accepted: 0 }
  }
}

function systemsWithResearch(context: InternalContext, researched: boolean): string[] {
  return researched
    ? [...new Set([...context.systems, 'Autonomous Research / Continuous Learning'])]
    : context.systems
}

export async function tryCOSFirstAnswer(input: {
  prompt: string
  userId?: string | null
  language?: string
  privileged?: boolean
}): Promise<COSFirstAnswerResult> {
  let context = await retrieveInternalContext(input.prompt, input.userId)
  let research = { attempted: false, accepted: 0 }

  if (!configured()) {
    research = await runInlineResearch(input.prompt)
    if (research.accepted > 0) context = await retrieveInternalContext(input.prompt, input.userId)
    const reason = 'Local COS inference is not configured after internal retrieval and autonomous research.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    const provenance: COSFallbackProvenance = {
      responseSource: 'external_fallback_required',
      externalAiInvoked: false,
      localModelInvoked: false,
      autonomousResearchInvoked: research.attempted,
      knowledgeNewlyRetained: research.accepted,
      internalSystemsConsulted: systemsWithResearch(context, research.attempted),
      knowledgeFactsUsed: context.facts.length,
      learnedItemsUsed: context.learned.length,
      userMemoriesUsed: context.memories.length,
    }
    return { handled: false, confidence: 0, reason, provenance }
  }

  let attempt = await localAttempt({ prompt: input.prompt, language: input.language, context })
  if (attempt && attempt.confidence >= threshold()) {
    void resolveKnowledgeGap(input.prompt)
    return {
      handled: true,
      reply: attempt.answer,
      confidence: attempt.confidence,
      provenance: {
        responseSource: 'local_cos_reasoning',
        externalAiInvoked: false,
        localModelInvoked: true,
        autonomousResearchInvoked: false,
        knowledgeNewlyRetained: 0,
        internalSystemsConsulted: context.systems,
        knowledgeFactsUsed: context.facts.length,
        learnedItemsUsed: context.learned.length,
        userMemoriesUsed: context.memories.length,
      },
    }
  }

  // Before any provider escalation, COS gets one bounded research pass across approved
  // live sources (YouTube transcripts, scientific/technical feeds, official docs, etc.),
  // retains admissible knowledge, reloads its internal context and retries local reasoning.
  research = await runInlineResearch(input.prompt)
  if (research.accepted > 0) context = await retrieveInternalContext(input.prompt, input.userId)
  attempt = await localAttempt({ prompt: input.prompt, language: input.language, context })

  if (attempt && attempt.confidence >= threshold()) {
    void resolveKnowledgeGap(input.prompt)
    return {
      handled: true,
      reply: attempt.answer,
      confidence: attempt.confidence,
      provenance: {
        responseSource: 'local_cos_reasoning',
        externalAiInvoked: false,
        localModelInvoked: true,
        autonomousResearchInvoked: research.attempted,
        knowledgeNewlyRetained: research.accepted,
        internalSystemsConsulted: systemsWithResearch(context, research.attempted),
        knowledgeFactsUsed: context.facts.length,
        learnedItemsUsed: context.learned.length,
        userMemoriesUsed: context.memories.length,
      },
    }
  }

  const confidence = attempt?.confidence ?? 0
  const reason = attempt
    ? `COS confidence ${confidence.toFixed(2)} remains below escalation threshold ${threshold().toFixed(2)} after autonomous research.`
    : 'COS local inference did not produce a usable answer after autonomous research.'
  void recordKnowledgeGap(input.prompt, confidence, reason)

  return {
    handled: false,
    confidence,
    reason,
    provenance: {
      responseSource: 'external_fallback_required',
      externalAiInvoked: false,
      localModelInvoked: true,
      autonomousResearchInvoked: research.attempted,
      knowledgeNewlyRetained: research.accepted,
      internalSystemsConsulted: systemsWithResearch(context, research.attempted),
      knowledgeFactsUsed: context.facts.length,
      learnedItemsUsed: context.learned.length,
      userMemoriesUsed: context.memories.length,
    },
  }
}
