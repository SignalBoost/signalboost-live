import { callLocalModel } from '@/lib/ai/local-inference'
import { loadUserMemories } from '@/lib/ai/tools/userMemory'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export type COSFirstAnswerResult =
  | {
      handled: true
      reply: string
      confidence: number
      provenance: {
        responseSource: 'local_cos_reasoning'
        externalAiInvoked: false
        localModelInvoked: true
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
        internalSystemsConsulted: string[]
        knowledgeFactsUsed: number
        learnedItemsUsed: number
        userMemoriesUsed: number
      }
    }

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
  return [...new Set(
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4 && !STOP_WORDS.has(part)),
  )].slice(0, 6)
}

function safeText(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
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

export async function tryCOSFirstAnswer(input: {
  prompt: string
  userId?: string | null
  language?: string
  privileged?: boolean
}): Promise<COSFirstAnswerResult> {
  const emptyProvenance = {
    responseSource: 'external_fallback_required' as const,
    externalAiInvoked: false,
    localModelInvoked: false,
    internalSystemsConsulted: ['semantic/exact cache preflight'],
    knowledgeFactsUsed: 0,
    learnedItemsUsed: 0,
    userMemoriesUsed: 0,
  }

  if (!configured()) {
    return { handled: false, confidence: 0, reason: 'Local COS inference is not configured.', provenance: emptyProvenance }
  }

  const context = await retrieveInternalContext(input.prompt, input.userId)
  const evidenceCount = context.facts.length + context.learned.length
  const internalContext = [
    context.facts.length ? `KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}` : '',
    context.learned.length ? `CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}` : '',
    context.memories.length ? `USER ENTERPRISE MEMORY:\n${context.memories.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  const raw = await callLocalModel({
    temperature: 0.15,
    maxTokens: 3000,
    systemPrompt: `You are COS, SignalBoost's local, provider-independent reasoning engine. You are the PRIMARY reasoning layer, not a wrapper around a cloud model. Reason carefully from the user's question, your local model knowledge, and the supplied internal evidence. Distinguish evidence from inference. Never invent having consulted a source that is not present. If evidence is insufficient, lower confidence instead of bluffing. Reply in ${input.language || 'English'}. Return ONLY strict JSON with this shape: {"answer":"complete answer","confidence":0.0}.`,
    prompt: `${internalContext || 'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`,
  }).catch(() => null)

  const provenanceBase = {
    externalAiInvoked: false as const,
    localModelInvoked: true as const,
    internalSystemsConsulted: context.systems,
    knowledgeFactsUsed: context.facts.length,
    learnedItemsUsed: context.learned.length,
    userMemoriesUsed: context.memories.length,
  }

  if (!raw) {
    return {
      handled: false,
      confidence: 0,
      reason: 'Local COS inference did not return an answer.',
      provenance: { responseSource: 'external_fallback_required', ...provenanceBase },
    }
  }

  const parsed = parseLocalResult(raw)
  if (!parsed) {
    return {
      handled: false,
      confidence: 0,
      reason: 'Local COS inference returned an unparseable result.',
      provenance: { responseSource: 'external_fallback_required', ...provenanceBase },
    }
  }

  // Confidence is not accepted blindly from the model. Durable internal evidence raises
  // the ceiling; an unsupported local answer can still pass, but only at a conservative cap.
  const evidenceCeiling = evidenceCount >= 5 ? 0.96 : evidenceCount >= 2 ? 0.90 : evidenceCount === 1 ? 0.84 : 0.78
  const confidence = Math.min(parsed.confidence, evidenceCeiling)

  if (confidence < threshold()) {
    return {
      handled: false,
      confidence,
      reason: `Local COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}.`,
      provenance: { responseSource: 'external_fallback_required', ...provenanceBase },
    }
  }

  return {
    handled: true,
    reply: parsed.answer,
    confidence,
    provenance: { responseSource: 'local_cos_reasoning', ...provenanceBase },
  }
}
