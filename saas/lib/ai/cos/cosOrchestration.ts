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

export function isProvenanceIntrospection(input: string): boolean {
  const provenance = /\b(provenance|introspection|execution provenance|execution telemetry|audit trail|model contribution|model contributions|which model|what model|primary model|reasoner|semantic cache|enterprise memory|knowledge graph|learned corpus|learning corpus|autonomous research|external ai|external provider|internal systems?)\b/i
  const referent = /\b(previous|preceding|prior|last|just|that|this|answer|response|request|execution|used|invoked|contributed|generated|reasoning)\b/i
  return provenance.test(input) && referent.test(input)
}

export function requestsExternalAction(input: string): boolean {
  if (isProvenanceIntrospection(input)) return false
  const explicitExecution = /\b(run|execute|perform|investigate|check|fetch|pull|read|scan|audit|search|look up|research|deploy|commit|merge|create|update|delete|send|publish|queue|launch|start|fix|repair|change|modify|call the tool|use (?:the )?tools?)\b/i
  const target = /\b(repo|repository|github|vercel|supabase|logs?|metrics?|status page|production|database|table|file|route|api|web|internet|youtube|publication|magazine|journal|provider|campaign|prospect)\b/i
  return explicitExecution.test(input) && target.test(input)
}

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
    enterprise_memory: { used: (p?.knowledgeFactsCited ?? 0) > 0, retrieved_count: p?.knowledgeFactsUsed ?? 0, evidence_count: p?.knowledgeFactsCited ?? 0 },
    knowledge_graph: { used: (p?.knowledgeFactsCited ?? 0) > 0, retrieved_count: p?.knowledgeFactsUsed ?? 0, evidence_count: p?.knowledgeFactsCited ?? 0 },
    learned_corpus: { used: (p?.learnedItemsCited ?? 0) > 0, retrieved_count: p?.learnedItemsUsed ?? 0, evidence_count: p?.learnedItemsCited ?? 0 },
    user_memory: { used: (p?.userMemoriesCited ?? 0) > 0, retrieved_count: p?.userMemoriesUsed ?? 0, evidence_count: p?.userMemoriesCited ?? 0 },
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

function usedLabel(value: boolean): string { return value ? 'USED' : 'NOT USED' }
function invokedLabel(value: boolean): string { return value ? 'INVOKED' : 'NOT INVOKED' }

/** Full, stable execution-provenance report. Retrieved and cited counts are kept separate:
 * retrieval means evidence entered the reasoner context; USED means the answer actually cited it.
 */
export function formatAuthoritativeProvenance(
  provenance: ReturnType<typeof authoritativeProvenance>,
  language: string,
): string {
  const recorded = provenance as any
  const kg = provenance.knowledge_graph as { used:boolean; evidence_count:number; retrieved_count?:number }
  const em = provenance.enterprise_memory as { used:boolean; evidence_count:number; retrieved_count?:number }
  const lc = provenance.learned_corpus as { used:boolean; evidence_count:number; retrieved_count?:number }
  const um = provenance.user_memory as { used:boolean; evidence_count:number; retrieved_count?:number }
  const lines = [
    'This is the real, recorded provenance for the immediately preceding answer. It is server execution telemetry, not a model-generated reconstruction.',
    '',
    'Provenance',
    '──────────',
  ]

  if (recorded.deterministic_utility?.used) {
    const utility = String(recorded.deterministic_utility.utility || 'server utility')
    const timezone = recorded.deterministic_utility.timezone ? `; timezone ${recorded.deterministic_utility.timezone}` : ''
    lines.push(`Deterministic Utility : USED — ${utility}${timezone}`)
  }

  lines.push(
    `Semantic Cache        : ${usedLabel(provenance.semantic_cache.used)} — ${provenance.semantic_cache.evidence_count} cached result${provenance.semantic_cache.evidence_count === 1 ? '' : 's'} contributed.`,
    `Enterprise Memory     : ${usedLabel(em.used)} — ${em.evidence_count} cited of ${em.retrieved_count ?? em.evidence_count} retrieved retained fact${(em.retrieved_count ?? em.evidence_count) === 1 ? '' : 's'}.`,
    `Knowledge Graph       : ${usedLabel(kg.used)} — ${kg.evidence_count} cited of ${kg.retrieved_count ?? kg.evidence_count} retrieved graph-backed fact${(kg.retrieved_count ?? kg.evidence_count) === 1 ? '' : 's'}.`,
    `Learned Corpus        : ${usedLabel(lc.used)} — ${lc.evidence_count} cited of ${lc.retrieved_count ?? lc.evidence_count} retrieved learned item${(lc.retrieved_count ?? lc.evidence_count) === 1 ? '' : 's'}.`,
    `User Memory           : ${usedLabel(um.used)} — ${um.evidence_count} cited of ${um.retrieved_count ?? um.evidence_count} retrieved saved memor${(um.retrieved_count ?? um.evidence_count) === 1 ? 'y' : 'ies'}.`,
    `Autonomous Research   : ${usedLabel(provenance.autonomous_research.used)} — ${provenance.autonomous_research.documents_acquired} documents acquired; ${provenance.autonomous_research.new_knowledge_retained} new knowledge items retained during this request.`,
    `Local Reasoning Engine: ${invokedLabel(provenance.local_reasoning.invoked)}${provenance.local_reasoning.model ? ` — ${provenance.local_reasoning.model}` : ''}.`,
    `External AI Provider  : ${invokedLabel(provenance.external_ai.invoked)}${provenance.external_ai.invoked ? ` — provider ${provenance.external_ai.provider || 'unknown'}${provenance.external_ai.model ? `; model ${provenance.external_ai.model}` : ''}` : ' — no OpenAI, Anthropic, Gemini, or other external model contributed to the recorded answer.'}`,
  )

  if (provenance.local_reasoning.confidence != null) {
    lines.push(`COS Confidence        : ${Number(provenance.local_reasoning.confidence).toFixed(2)} — threshold ${provenance.local_reasoning.threshold.toFixed(2)}.`)
  }
  if (language !== 'en') lines.push('', 'Note: provenance labels remain explicit and stable; the recorded values above are language-independent telemetry.')
  return lines.join('\n')
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
