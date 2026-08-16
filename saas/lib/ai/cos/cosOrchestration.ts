// Compatibility entrypoint. Keep all existing imports stable while per-answer provenance remains
// authoritative and live system state is appended independently at introspection time.
import {
  authoritativeProvenance as liveAuthoritativeProvenance,
  formatAuthoritativeProvenance as liveFormatAuthoritativeProvenance,
} from './cosOrchestrationLive'

export * from './cosOrchestrationLive'

/**
 * Fresh-current-fact local synthesis is still local reasoning, but its factual authority came from
 * live search performed during this request. Preserve that distinction in the server provenance so
 * introspection never makes a live-grounded answer look like model-memory reasoning.
 */
export function authoritativeProvenance(
  cos: any,
  external: { invoked: boolean; provider?: string | null; model?: string | null },
) {
  const provenance = liveAuthoritativeProvenance(cos, external) as any
  const current = cos?.provenance ?? null
  const live = current?.liveExternalEvidence
  const sources = Array.isArray(live?.sources) ? live.sources : []
  const semanticCacheReplay = current?.responseSource === 'semantic_cache' || current?.responseSource === 'semantic_similarity'

  provenance.external_ai = {
    ...(provenance.external_ai || {}),
    necessary: external.invoked ? current?.externalAiNecessary !== false : false,
    escalation_reason_code: current?.escalationReasonCode ?? null,
    escalation_reason: current?.escalationReason ?? null,
  }

  // Context retrieval can occur before a semantic-cache lookup resolves. On a cache replay that
  // context was never consumed by a reasoner, so it is retrieval telemetry only: never injected,
  // never cited, and never USED. The original generation funnel remains preserved separately under
  // answer_origin.evidence_funnel and is not modified here.
  if (semanticCacheReplay) {
    for (const key of ['enterprise_memory', 'knowledge_graph', 'learned_corpus', 'cognitive_skills', 'user_memory']) {
      const item = provenance?.[key]
      if (!item || typeof item !== 'object') continue
      item.used = false
      item.injected_count = 0
      item.evidence_count = 0
    }
  }

  if (current?.deterministicFreshFactUsed === true) {
    provenance.deterministic_utility = {
      used: true,
      utility: 'authoritative_live_consensus',
    }
  }
  if (current?.evidenceBudget && typeof current.evidenceBudget === 'object') {
    provenance.evidence_budget = current.evidenceBudget
  }

  if (!live || !sources.length) return provenance

  provenance.semantic_cache = { used: false, evidence_count: 0 }
  provenance.autonomous_research = {
    used: true,
    attempted: true,
    documents_acquired: Number(current?.researchDocumentsAcquired ?? sources.length) || 0,
    new_knowledge_retained: 0,
    error: null,
  }
  provenance.live_external_evidence = {
    used: true,
    attempted: true,
    retrieved_at: live.retrievedAt || null,
    error: null,
    sources: sources.map((source: any) => ({
      id: source?.id || 'LIVE',
      title: source?.title || 'source',
      url: source?.url || '',
    })),
  }
  provenance.answer_origin = {
    ...(provenance.answer_origin || {}),
    from_cache: false,
    stored_at: null,
    policy_version: null,
    grounded_at: live.retrievedAt || null,
    live_evidence_sources: provenance.live_external_evidence.sources,
  }
  return provenance
}

function insertBeforeLiveSystemState(text: string, addition: string): string {
  const marker = '\n\nLIVE SYSTEM STATE'
  const index = text.indexOf(marker)
  if (index < 0) return `${text}\n${addition}`
  return `${text.slice(0, index)}\n${addition}${text.slice(index)}`
}

/** Append the machine-recorded escalation decision and evidence budget to the existing truthful formatter. */
export function formatAuthoritativeProvenance(provenance: any, language: string): string {
  let formatted = liveFormatAuthoritativeProvenance(provenance, language)
  const external = provenance?.external_ai ?? {}
  const necessary = external?.necessary === true
  const invoked = external?.invoked === true
  const reasonCode = external?.escalation_reason_code ? String(external.escalation_reason_code) : null
  const reason = external?.escalation_reason ? String(external.escalation_reason) : null
  const necessityLine = necessary
    ? `External AI Necessity : REQUIRED${reasonCode ? ` — ${reasonCode}` : ''}${reason ? `; ${reason}` : ''}.`
    : invoked
      ? 'External AI Necessity : NOT JUSTIFIED — provider was invoked without a recorded necessity decision.'
      : 'External AI Necessity : NOT REQUIRED.'
  formatted = insertBeforeLiveSystemState(formatted, necessityLine)

  const budget = provenance?.evidence_budget
  if (budget && typeof budget === 'object') {
    const received = Number(budget.results_received ?? 0) || 0
    const selected = Number(budget.evidence_selected ?? 0) || 0
    const limit = Number(budget.search_result_limit ?? 0) || 0
    const stop = budget.stopping_reason ? String(budget.stopping_reason) : 'not_recorded'
    formatted = insertBeforeLiveSystemState(
      formatted,
      `Evidence Budget        : limit ${limit}; ${received} received → ${selected} material; stop ${stop}.`,
    )
  }
  return formatted
}