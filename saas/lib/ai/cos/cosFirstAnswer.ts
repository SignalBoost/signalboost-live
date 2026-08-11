import { callCosReasoner, resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
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
        /** 'local:<model>' or 'dedicated-cloud:<model>' — which COS reasoner produced the answer. */
        reasonerLabel: string
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
        reasonerLabel: string | null
        internalSystemsConsulted: string[]
        knowledgeFactsUsed: number
        learnedItemsUsed: number
        userMemoriesUsed: number
      }
    }

type COSFallbackProvenance = Extract<COSFirstAnswerResult, { handled: false }>['provenance']

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'being', 'could', 'does', 'from', 'have', 'into',
  'more', 'most', 'should', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through', 'under', 'what',
  'when', 'where', 'which', 'while', 'with', 'would', 'your', 'you', 'and', 'the', 'for', 'are', 'how', 'why',
])

function configured(): boolean {
  if (process.env.COS_LOCAL_FIRST_ENABLED === 'false') return false
  return resolveCosReasoner().config !== null
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

export async function tryCOSFirstAnswer(input: {
  prompt: string
  userId?: string | null
  language?: string
  privileged?: boolean
}): Promise<COSFirstAnswerResult> {
  const emptyProvenance: COSFallbackProvenance = {
    responseSource: 'external_fallback_required',
    externalAiInvoked: false,
    localModelInvoked: false,
    reasonerLabel: null,
    internalSystemsConsulted: ['semantic/exact cache preflight'],
    knowledgeFactsUsed: 0,
    learnedItemsUsed: 0,
    userMemoriesUsed: 0,
  }

  if (!configured()) {
    const resolved = resolveCosReasoner()
    const reason = 'reason' in resolved ? resolved.reason : 'COS-first answering is disabled by COS_LOCAL_FIRST_ENABLED.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    return { handled: false, confidence: 0, reason, provenance: emptyProvenance }
  }

  const context = await retrieveInternalContext(input.prompt, input.userId)
  const evidenceCount = context.facts.length + context.learned.length
  const internalContext = [
    context.facts.length ? `KNOWLEDGE GRAPH FACTS:\n${context.facts.join('\n')}` : '',
    context.learned.length ? `CONTINUOUS LEARNING CORPUS:\n${context.learned.join('\n')}` : '',
    context.memories.length ? `USER ENTERPRISE MEMORY:\n${context.memories.join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  const reasoned = await callCosReasoner({
    temperature: 0.15,
    maxTokens: 3000,
    systemPrompt: `You are COS, SignalBoost's local, provider-independent reasoning engine. You are the PRIMARY reasoning layer, not a wrapper around a cloud model. Reason carefully from the user's question, your local model knowledge, and the supplied internal evidence. Distinguish evidence from inference. Never invent having consulted a source that is not present. If evidence is insufficient, lower confidence instead of bluffing. Reply in ${input.language || 'English'}. Return ONLY strict JSON with this shape: {"answer":"complete answer","confidence":0.0}.`,
    prompt: `${internalContext || 'No matching durable internal evidence was retrieved for this question.'}\n\nUSER QUESTION:\n${input.prompt}`,
  }).catch(() => null)
  const raw = reasoned?.text ?? null

  const provenanceBase = {
    externalAiInvoked: false as const,
    localModelInvoked: true as const,
    reasonerLabel: reasoned?.reasoner.label ?? resolveCosReasoner().config?.label ?? null,
    internalSystemsConsulted: context.systems,
    knowledgeFactsUsed: context.facts.length,
    learnedItemsUsed: context.learned.length,
    userMemoriesUsed: context.memories.length,
  }

  if (!raw) {
    const reason = 'Local COS inference did not return an answer.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    return {
      handled: false,
      confidence: 0,
      reason,
      provenance: { responseSource: 'external_fallback_required', ...provenanceBase },
    }
  }

  const parsed = parseLocalResult(raw)
  if (!parsed) {
    const reason = 'Local COS inference returned an unparseable result.'
    void recordKnowledgeGap(input.prompt, 0, reason)
    return {
      handled: false,
      confidence: 0,
      reason,
      provenance: { responseSource: 'external_fallback_required', ...provenanceBase },
    }
  }

  // Confidence is not accepted blindly from the model. Durable internal evidence raises
  // the ceiling; an unsupported local answer can still pass, but only at a conservative cap.
  const evidenceCeiling = evidenceCount >= 5 ? 0.96 : evidenceCount >= 2 ? 0.90 : evidenceCount === 1 ? 0.84 : 0.78
  const confidence = Math.min(parsed.confidence, evidenceCeiling)

  if (confidence < threshold()) {
    const reason = `Local COS confidence ${confidence.toFixed(2)} is below escalation threshold ${threshold().toFixed(2)}.`
    void recordKnowledgeGap(input.prompt, confidence, reason)
    return {
      handled: false,
      confidence,
      reason,
      provenance: { responseSource: 'external_fallback_required', ...provenanceBase },
    }
  }

  void resolveKnowledgeGap(input.prompt)
  return {
    handled: true,
    reply: parsed.answer,
    confidence,
    provenance: {
      responseSource: 'local_cos_reasoning',
      ...provenanceBase,
      reasonerLabel: reasoned?.reasoner.label ?? 'unknown',
    },
  }
}

/**
 * The honest workflow line the owner asked for, appended to a COS-first answer or an
 * escalation notice. States what actually ran, in order, in the user's language —
 * cache/knowledge search first, COS's own reasoner, external AI only as last resort.
 * Numbers come from the provenance, never from prose.
 */
export function formatCosWorkflowStatement(result: COSFirstAnswerResult, language = 'en'): string {
  const p = result.provenance
  const evidence = `${p.knowledgeFactsUsed} knowledge facts, ${p.learnedItemsUsed} learned items, ${p.userMemoriesUsed} memories`
  const M: Record<string, { handled: string; fallback: string }> = {
    en: {
      handled: `Workflow: searched COS knowledge, learning corpus and memory first (${evidence}) → answered by COS's own reasoner (${p.reasonerLabel}) at confidence ${result.confidence.toFixed(2)}. No external AI was called.`,
      fallback: `Workflow: searched COS knowledge, learning corpus and memory first (${evidence}) → COS's own reasoning was not confident enough → escalating to external AI as the last resort. This gap was recorded for COS to learn.`,
    },
    es: {
      handled: `Flujo: primero se buscó en el conocimiento, corpus de aprendizaje y memoria de COS (${evidence}) → respondido por el razonador propio de COS (${p.reasonerLabel}) con confianza ${result.confidence.toFixed(2)}. No se llamó a ninguna IA externa.`,
      fallback: `Flujo: primero se buscó en el conocimiento, corpus de aprendizaje y memoria de COS (${evidence}) → el razonamiento propio de COS no alcanzó la confianza necesaria → escalando a IA externa como último recurso. Esta brecha quedó registrada para que COS aprenda.`,
    },
    pt: {
      handled: `Fluxo: primeiro buscou-se no conhecimento, corpus de aprendizado e memória do COS (${evidence}) → respondido pelo raciocinador próprio do COS (${p.reasonerLabel}) com confiança ${result.confidence.toFixed(2)}. Nenhuma IA externa foi chamada.`,
      fallback: `Fluxo: primeiro buscou-se no conhecimento, corpus de aprendizado e memória do COS (${evidence}) → o raciocínio próprio do COS não atingiu a confiança necessária → escalando para IA externa como último recurso. Esta lacuna foi registrada para o COS aprender.`,
    },
    pl: {
      handled: `Przebieg: najpierw przeszukano wiedzę, korpus uczenia i pamięć COS (${evidence}) → odpowiedzi udzielił własny moduł rozumowania COS (${p.reasonerLabel}) z pewnością ${result.confidence.toFixed(2)}. Nie wywołano zewnętrznej AI.`,
      fallback: `Przebieg: najpierw przeszukano wiedzę, korpus uczenia i pamięć COS (${evidence}) → własne rozumowanie COS nie osiągnęło wymaganej pewności → eskalacja do zewnętrznej AI w ostateczności. Luka została zapisana, aby COS mógł się nauczyć.`,
    },
    ru: {
      handled: `Процесс: сначала выполнен поиск в знаниях, корпусе обучения и памяти COS (${evidence}) → ответ дал собственный модуль рассуждений COS (${p.reasonerLabel}) с уверенностью ${result.confidence.toFixed(2)}. Внешний ИИ не вызывался.`,
      fallback: `Процесс: сначала выполнен поиск в знаниях, корпусе обучения и памяти COS (${evidence}) → собственных рассуждений COS оказалось недостаточно → эскалация к внешнему ИИ как крайняя мера. Пробел записан, чтобы COS мог обучиться.`,
    },
  }
  const pack = M[language] || M.en
  return result.handled ? pack.handled : pack.fallback
}
