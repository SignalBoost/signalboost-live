import { callLocalModel } from '@/lib/ai/local-inference'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { runTargetedGapResearch } from '@/lib/ai/cos/targetedResearch'

type COSProvenance = {
  responseSource: 'local_cos_reasoning' | 'external_fallback_required'
  externalAiInvoked: false
  localModelInvoked: boolean
  internalSystemsConsulted: string[]
  knowledgeFactsUsed: number
  learnedItemsUsed: number
  userMemoriesUsed: number
  autonomousResearchAttempted?: boolean
  researchDocumentsAcquired?: number
  knowledgeNewlyRetained?: number
}

export type COSFirstAnswerResult =
  | { handled: true; reply: string; confidence: number; provenance: COSProvenance & { responseSource: 'local_cos_reasoning'; localModelInvoked: true } }
  | { handled: false; confidence: number; reason: string; provenance: COSProvenance & { responseSource: 'external_fallback_required' } }

type InternalContext = Awaited<ReturnType<typeof retrieveInternalContext>>

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'being', 'could', 'does', 'from', 'have', 'into',
  'more', 'most', 'should', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'what',
  'when', 'where', 'which', 'while', 'with', 'would', 'your', 'you', 'and', 'the', 'for', 'are', 'how', 'why',
])

function configured(): boolean {
  return process.env.COS_LOCAL_FIRST_ENABLED !== 'false'
    && Boolean(process.env.LOCAL_AI_BASE_URL?.trim())
    && Boolean(process.env.LOCAL_AI_MODEL?.trim())
}

function threshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function queryTerms(prompt: string): string[] {
  return [...new Set(prompt.toLowerCase().replace(/[^a-z0-9\s_-]/g, ' ').split(/\s+/)
    .map((part) => part.trim()).filter((part) => part.length >= 4 && !STOP_WORDS.has(part)))].slice(0, 6)
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
    const existing = await db.from('cos_learning_gaps').select('id,repeated_count')
      .eq('task_id', 'support').eq('subject', subject).eq('question', question).eq('capability', capability).maybeSingle()
    if (existing.data?.id) {
      await db.from('cos_learning_gaps').update({
        confidence, escalation_reason: safeText(reason, 1000), repeated_count: Number(existing.data.repeated_count || 1) + 1,
        status: 'pending', last_seen_at: new Date().toISOString(), resolved_at: null,
      }).eq('id', existing.data.id)
      return
    }
    await db.from('cos_learning_gaps').insert({
      task_id: 'support', subject, question, capability, confidence, escalation_reason: safeText(reason, 1000),
      repeated_count: 1, status: 'pending', last_seen_at: new Date().toISOString(),
    })
  } catch {
  }
}

async function resolveKnowledgeGap(prompt: string): Promise<void> {
  const db = cosServiceDb()
  if (!db) return
  try {
    await db.from('cos_learning_gaps').update({
      status: 'resolved', resolved_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
    }).eq('task_id', 'support').eq('question', safeText(prompt, 2000)).eq('capability', 'general_reasoning')
      .in('status', ['pending', 'learning', 'failed'])
  } catch {
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
    systems.push('Enterprise Memory / Knowledge Graph', 'Continuous Learning Corpus')
    const factFilters = terms.flatMap((term) => [`subject.ilike.%${term}%`, `predicate.ilike.%${term}%`, `object.ilike.%${term}%`]).join(',')
    const learnedFilters = terms.flatMap((term) => [`subject.ilike.%${term}%`, `summary.ilike.%${term}%`]).join(',')
    const [factResult, learnedResult] = await Promise.allSettled([
      db.from('cos_knowledge_facts').select('subject,predicate,object,confidence,source,updated_at')
        .or(factFilters).order('confidence', { ascending: false }).limit(16),
      db.from('cos_continuous_learning').select('subject,summary,facts,confidence,source_kind,source_uri,observed_at')
        .or(learnedFilters).order('confidence', { ascending: false }).limit(12),
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
  } catch { return null }
}

function contextPrompt(context: InternalContext): string {
  return [
    context.facts.length ? `KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}` : '',
    context.learned.length ? `CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}` : '',
    context.memories.length ? `USER ENTERPRISE MEMORY:\n${context.memories.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}

async function localAttempt(prompt: string, language: string, context: InternalContext) {
  const raw = await callLocalModel({
    temperature: 0.15,
    maxTokens: 3000,
    systemPrompt: `You are COS, SignalBoost's local, provider-independent reasoning engine. You are the PRIMARY reasoning layer, not a wrapper around a cloud model. Reason carefully from the user's question, your local model knowledge, and the supplied internal evidence. Distinguish evidence from inference. Never invent having consulted a source that is not present. If evidence is insufficient, lower confidence instead of bluffing. Reply in ${language}. Return ONLY strict JSON with this shape: {"answer":"complete answer","confidence":0.0}.`,
    prompt: `${contextPrompt(context) || 'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${prompt}`,
  }).catch(() => null)
  const parsed = raw ? parseLocalResult(raw) : null
  if (!parsed) return { answer: '', confidence: 0, valid: false }
  const evidenceCount = context.facts.length + context.learned.length
  const evidenceCeiling = evidenceCount >= 5 ? 0.96 : evidenceCount >= 2 ? 0.90 : evidenceCount === 1 ? 0.84 : 0.78
  return { answer: parsed.answer, confidence: Math.min(parsed.confidence, evidenceCeiling), valid: true }
}

function provenance(context: InternalContext, research?: { attempted: boolean; documentsAcquired: number; accepted: number }, localModelInvoked = true): Omit<COSProvenance, 'responseSource'> {
  const systems = [...context.systems]
  if (research?.attempted) systems.push('Autonomous Research / Continuous Learning')
  return {
    externalAiInvoked: false,
    localModelInvoked,
    internalSystemsConsulted: [...new Set(systems)],
    knowledgeFactsUsed: context.facts.length,
    learnedItemsUsed: context.learned.length,
    userMemoriesUsed: context.memories.length,
    autonomousResearchAttempted: research?.attempted ?? false,
    researchDocumentsAcquired: research?.documentsAcquired ?? 0,
    knowledgeNewlyRetained: research?.accepted ?? 0,
  }
}

export async function tryCOSFirstAnswer(input: { prompt: string; userId?: string | null; language?: string; privileged?: boolean }): Promise<COSFirstAnswerResult> {
  let context = await retrieveInternalContext(input.prompt, input.userId)
  const language = input.language || 'English'

  // Even without a local model, COS can still close the knowledge gap by learning from
  // approved zero-LLM sources. The request fails closed, but the next attempt has more evidence.
  if (!configured()) {
    const research = await runTargetedGapResearch({ prompt: input.prompt, subject: subjectFromPrompt(input.prompt) }).catch(() => ({ attempted: false, documentsAcquired: 0, accepted: 0, rejected: {}, sourceAdapters: 0 }))
    const reason = `Local COS inference is not configured.${research.accepted ? ` Autonomous research retained ${research.accepted} new item(s).` : ''}`
    await recordKnowledgeGap(input.prompt, 0, reason)
    return { handled: false, confidence: 0, reason, provenance: { responseSource: 'external_fallback_required', ...provenance(context, research, false) } }
  }

  const first = await localAttempt(input.prompt, language, context)
  if (first.valid && first.confidence >= threshold()) {
    void resolveKnowledgeGap(input.prompt)
    return { handled: true, reply: first.answer, confidence: first.confidence, provenance: { responseSource: 'local_cos_reasoning', ...provenance(context) } as COSProvenance & { responseSource: 'local_cos_reasoning'; localModelInvoked: true } }
  }

  // Critical order: local miss -> research approved public sources -> retain -> retrieve again -> retry local.
  // Cloud models are not called here.
  const initialReason = first.valid
    ? `Local COS confidence ${first.confidence.toFixed(2)} is below threshold ${threshold().toFixed(2)}.`
    : 'Local COS inference did not return a parseable answer.'
  await recordKnowledgeGap(input.prompt, first.confidence, initialReason)

  const research = await runTargetedGapResearch({ prompt: input.prompt, subject: subjectFromPrompt(input.prompt) })
    .catch(() => ({ attempted: false, documentsAcquired: 0, accepted: 0, rejected: {}, sourceAdapters: 0 }))

  if (research.accepted > 0) {
    context = await retrieveInternalContext(input.prompt, input.userId)
    const retry = await localAttempt(input.prompt, language, context)
    if (retry.valid && retry.confidence >= threshold()) {
      void resolveKnowledgeGap(input.prompt)
      return {
        handled: true,
        reply: retry.answer,
        confidence: retry.confidence,
        provenance: { responseSource: 'local_cos_reasoning', ...provenance(context, research) } as COSProvenance & { responseSource: 'local_cos_reasoning'; localModelInvoked: true },
      }
    }
    const reason = retry.valid
      ? `COS researched and retained ${research.accepted} item(s), but retry confidence ${retry.confidence.toFixed(2)} remained below ${threshold().toFixed(2)}.`
      : `COS researched and retained ${research.accepted} item(s), but local retry did not return a parseable answer.`
    await recordKnowledgeGap(input.prompt, retry.confidence, reason)
    return { handled: false, confidence: retry.confidence, reason, provenance: { responseSource: 'external_fallback_required', ...provenance(context, research) } }
  }

  const reason = `${initialReason} Autonomous research acquired ${research.documentsAcquired} document(s) and retained no new verified knowledge.`
  await recordKnowledgeGap(input.prompt, first.confidence, reason)
  return { handled: false, confidence: first.confidence, reason, provenance: { responseSource: 'external_fallback_required', ...provenance(context, research) } }
}
