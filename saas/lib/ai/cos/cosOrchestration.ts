// Compatibility entrypoint. Keep all existing imports stable while per-answer provenance remains
// authoritative and live system state is appended independently at introspection time.
import { authoritativeProvenance as liveAuthoritativeProvenance } from './cosOrchestrationLive'

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
  const live = cos?.provenance?.liveExternalEvidence
  const sources = Array.isArray(live?.sources) ? live.sources : []
  if (!live || !sources.length) return provenance

  provenance.semantic_cache = { used: false, evidence_count: 0 }
  provenance.autonomous_research = {
    used: true,
    attempted: true,
    documents_acquired: sources.length,
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
