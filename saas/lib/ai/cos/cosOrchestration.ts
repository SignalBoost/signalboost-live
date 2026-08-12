// saas/lib/ai/cos/cosOrchestration.ts
//
// THE ROOT CAUSE THIS FILE FIXES. As of Aug 12, /api/cos-primary/route.ts was the
// ONLY place tryCOSFirstAnswer, the confidence gate, and the provenance-introspection
// guard ever ran. app/api/support/route.ts — the route the real Concierge widget and
// every actual user actually talks to — never called any of it and went straight to
// Anthropic. Every "COS is not learning" symptom and every fabricated provenance
// answer ("here is the provenance for... lead magnets" on a question that never
// mentioned lead magnets) traced to that one fact: the whole COS-first system this
// week was built, tested, and proven correct on a road nobody's real traffic drives on.
//
// WHY EXTRACTED RATHER THAN DUPLICATED. Copy-pasting this logic into support/route.ts
// would create two implementations of "is this a provenance question" and "build an
// authoritative provenance report" that will drift the moment either file is edited
// without the other — the exact failure pattern this session found repeatedly
// (route.ts vs routeCore.ts, draftMessageFor vs outreachMessage/index.ts). One
// implementation, imported by both routes, so a fix here is a fix everywhere.
//
// WHAT STAYS OUT OF THIS FILE, DELIBERATELY. providerFromPayload and
// legacyContinuityFailure parse the LEGACY /api/concierge JSON response shape —
// specific to cos-primary's own escalation path, meaningless to support/route.ts,
// which talks to Anthropic directly rather than through that legacy payload. Live
// telemetry emission (buildCosLiveTelemetry/emitCosLiveTelemetry) is also not
// included here, since it is not yet verified against support/route.ts's call shape;
// wiring that in is a deliberate follow-up, not something to guess at silently.

import { resolveCosReasoner } from '@/lib/ai/cos/cosReasoner'
import { checkLocalInferenceHealth, localInferenceConfigFromEnv } from '@/lib/ai/local-inference'

export function confidenceThreshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

export function externalFallbackEnabled(): boolean {
  return process.env.COS_EXTERNAL_AI_FALLBACK_ENABLED !== 'false'
}

/**
 * Detects a question ABOUT the system's own reasoning — "show me the provenance",
 * "which model answered", "was the knowledge graph used" — as opposed to a question
 * that merely happens to share vocabulary with this domain. Requires BOTH a
 * provenance-vocabulary term AND a referent word pointing at a prior turn or the
 * execution itself, so an ordinary question about semantic caching in general
 * ("what is a semantic cache") does not falsely trigger introspection mode.
 */
export function isProvenanceIntrospection(input: string): boolean {
  const provenance = /\b(provenance|introspection|execution provenance|execution telemetry|audit trail|model contribution|model contributions|which model|what model|primary model|reasoner|semantic cache|enterprise memory|knowledge graph|learned corpus|learning corpus|autonomous research|external ai|external provider|internal systems?)\b/i
  const referent = /\b(previous|preceding|prior|last|just|that|this|answer|response|request|execution|used|invoked|contributed|generated|reasoning)\b/i
  return provenance.test(input) && referent.test(input)
}

/**
 * Detects a request to actually DO something external — run, fetch, deploy, commit —
 * as distinct from a question that merely discusses those verbs. A provenance question
 * is checked and excluded FIRST: "what did you just execute" contains "execute" but is
 * asking about the past, not requesting a new action.
 */
export function requestsExternalAction(input: string): boolean {
  if (isProvenanceIntrospection(input)) return false
  const explicitExecution = /\b(run|execute|perform|investigate|check|fetch|pull|read|scan|audit|search|look up|research|deploy|commit|merge|create|update|delete|send|publish|queue|launch|start|fix|repair|change|modify|call the tool|use (?:the )?tools?)\b/i
  const target = /\b(repo|repository|github|vercel|supabase|logs?|metrics?|status page|production|database|table|file|route|api|web|internet|youtube|publication|magazine|journal|provider|campaign|prospect)\b/i
  return explicitExecution.test(input) && target.test(input)
}

/**
 * The ONE authoritative provenance report. Built entirely from `cos.provenance` —
 * the real, structured object tryCOSFirstAnswer computed while actually answering —
 * never from asking a model to describe what it thinks happened. This is what makes
 * "show me the provenance" answerable honestly instead of by confabulation: the data
 * either exists here, truthfully, or the field says it was not used.
 */
export function authoritativeProvenance(
  cos: any,
  external: { invoked: boolean; provider?: string | null; model?: string | null },
) {
  const p = cos?.provenance ?? null
  const semanticCacheHit = p?.responseSource === 'semantic_cache' || p?.responseSource === 'semantic_similarity'
  return {
    schema_version: 1,
    authority: 'server_execution_telemetry',
    model_generated: false,
    semantic_cache: { used: semanticCacheHit, evidence_count: semanticCacheHit ? 1 : 0 },
    enterprise_memory: { used: (p?.knowledgeFactsUsed ?? 0) > 0, evidence_count: p?.knowledgeFactsUsed ?? 0 },
    knowledge_graph: { used: (p?.knowledgeFactsUsed ?? 0) > 0, evidence_count: p?.knowledgeFactsUsed ?? 0 },
    learned_corpus: { used: (p?.learnedItemsUsed ?? 0) > 0, evidence_count: p?.learnedItemsUsed ?? 0 },
    user_memory: { used: (p?.userMemoriesUsed ?? 0) > 0, evidence_count: p?.userMemoriesUsed ?? 0 },
    autonomous_research: {
      used: p?.autonomousResearchAttempted ?? false,
      documents_acquired: p?.researchDocumentsAcquired ?? 0,
      new_knowledge_retained: p?.knowledgeNewlyRetained ?? 0,
    },
    local_reasoning: {
      invoked: p?.localModelInvoked ?? false,
      model: p?.reasonerLabel ?? null,
      confidence: cos?.confidence ?? null,
      threshold: confidenceThreshold(),
    },
    external_ai: { invoked: external.invoked, provider: external.provider ?? null, model: external.model ?? null },
  }
}

/**
 * A short, honest sentence version of authoritativeProvenance for a chat reply —
 * support/route.ts returns prose to the user, not raw JSON. Every clause here reads
 * directly off the same authoritative object, so this can never diverge from what
 * authoritativeProvenance() itself would report. The formatter also understands
 * deterministic server-utility provenance, which shares the same execution schema
 * but is produced without COS reasoning at all.
 */
export function formatAuthoritativeProvenance(
  provenance: ReturnType<typeof authoritativeProvenance>,
  language: string,
): string {
  const recorded = provenance as any
  const usedList: string[] = []
  if (recorded.deterministic_utility?.used) {
    const utility = String(recorded.deterministic_utility.utility || 'server utility')
    const timezone = recorded.deterministic_utility.timezone ? `, ${recorded.deterministic_utility.timezone}` : ''
    usedList.push(`deterministic server utility (${utility}${timezone})`)
  }
  if (provenance.semantic_cache.used) usedList.push('semantic cache')
  if (provenance.knowledge_graph.used) usedList.push(`knowledge graph (${provenance.knowledge_graph.evidence_count} facts)`)
  if (provenance.learned_corpus.used) usedList.push(`learned corpus (${provenance.learned_corpus.evidence_count} items)`)
  if (provenance.user_memory.used) usedList.push('your saved memory')
  if (provenance.local_reasoning.invoked) usedList.push(`COS's own reasoner${provenance.local_reasoning.model ? ` (${provenance.local_reasoning.model})` : ''}`)
  if (provenance.external_ai.invoked) usedList.push(`external AI${provenance.external_ai.provider ? ` (${provenance.external_ai.provider}${provenance.external_ai.model ? `, ${provenance.external_ai.model}` : ''})` : ''}`)

  const usedText = usedList.length ? usedList.join(', ') : 'no COS internal systems — nothing was retrieved or invoked'
  const confidenceText = provenance.local_reasoning.confidence != null
    ? ` COS's own confidence was ${Number(provenance.local_reasoning.confidence).toFixed(2)} against a threshold of ${provenance.local_reasoning.threshold.toFixed(2)}.`
    : ''

  const templates: Record<string, string> = {
    en: `This is the real, recorded provenance for that answer — not a description generated after the fact: ${usedText}.${confidenceText}`,
    es: `Esta es la procedencia real y registrada de esa respuesta, no una descripción generada después de los hechos: ${usedText}.${confidenceText}`,
    pt: `Esta é a proveniência real e registrada dessa resposta — não uma descrição gerada depois do fato: ${usedText}.${confidenceText}`,
    pl: `To jest prawdziwa, zarejestrowana proweniencja tej odpowiedzi — nie opis wygenerowany po fakcie: ${usedText}.${confidenceText}`,
    ru: `Это реальное, зафиксированное происхождение этого ответа — не описание, придуманное постфактум: ${usedText}.${confidenceText}`,
  }
  return templates[language] || templates.en
}

export function escalationReason(
  cos: any,
  localError: string | null,
  requestedAction: boolean,
): { code: string; detail: string } {
  if (localError) return { code: 'local_reasoner_exception', detail: localError }
  if (requestedAction) return { code: 'explicit_external_action', detail: 'Delegated requested external action to governed executor.' }
  if (cos && !cos.handled) {
    const detail = String(cos.reason || 'COS declined the request without a reason.')
    if (/not configured/i.test(detail)) return { code: 'local_reasoner_not_configured', detail }
    if (/below escalation threshold/i.test(detail)) return { code: 'confidence_below_threshold', detail }
    if (/did not return an answer/i.test(detail)) return { code: 'local_reasoner_no_answer', detail }
    if (/unparseable/i.test(detail)) return { code: 'local_reasoner_unparseable', detail }
    return { code: 'cos_first_declined', detail }
  }
  return { code: 'cos_first_unavailable', detail: 'COS-first attempt unavailable.' }
}

export function logEscalation(event: Record<string, unknown>): void {
  console.warn('[cos-escalation-audit]', JSON.stringify({ at: new Date().toISOString(), ...event }))
}

export async function independentReasonerHealth(): Promise<{ configured: boolean; healthy: boolean; model: string | null; error: string | null }> {
  const resolved = resolveCosReasoner()
  if ('reason' in resolved) return { configured: false, healthy: false, model: null, error: resolved.reason }
  try {
    const health = await checkLocalInferenceHealth(localInferenceConfigFromEnv())
    return { configured: true, healthy: health.ok, model: health.model, error: health.error ?? null }
  } catch (error) {
    return {
      configured: true,
      healthy: false,
      model: process.env.LOCAL_AI_MODEL?.trim() || null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
