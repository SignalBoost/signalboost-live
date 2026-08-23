// Compatibility entrypoint. Keep all existing imports stable while per-answer provenance remains
// authoritative and live system state is appended independently at introspection time.
import {
  authoritativeProvenance as liveAuthoritativeProvenance,
  formatAuthoritativeProvenance as liveFormatAuthoritativeProvenance,
} from './cosOrchestrationLive.ts'

export * from './cosOrchestrationLive.ts'

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
  const turnId = typeof current?.turnId === 'string' ? current.turnId.trim() : ''
  if (turnId) provenance.turnId = turnId
  const live = current?.liveExternalEvidence
  const sources = Array.isArray(live?.sources) ? live.sources : []
  const semanticCacheReplay = current?.responseSource === 'semantic_cache' || current?.responseSource === 'semantic_similarity'

  const canonical = current?.canonicalSelfKnowledgeUsed ?? null
  provenance.canonical_self_knowledge = {
    used: Boolean(canonical?.enterpriseMemoryDefinition || canonical?.semanticCacheDefinition),
    enterprise_memory_definition: Boolean(canonical?.enterpriseMemoryDefinition),
    semantic_cache_definition: Boolean(canonical?.semanticCacheDefinition),
  }

  provenance.external_ai = {
    ...(provenance.external_ai || {}),
    necessary: external.invoked ? current?.externalAiNecessary !== false : false,
    escalation_reason_code: current?.escalationReasonCode ?? null,
    escalation_reason: current?.escalationReason ?? null,
  }

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

function count(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

function evidenceWhy(item: any): string {
  const selected = count(item?.selected_count)
  const injected = count(item?.injected_count)
  const cited = count(item?.evidence_count)
  return `${selected} selected → ${injected} injected → ${cited} cited in the recorded answer path`
}

function recordedInfluenceInterpretation(provenance: any): string {
  const material: string[] = []
  const consultedOnly: string[] = []

  const evidenceRows: Array<[string, any]> = [
    ['Enterprise Memory', provenance?.enterprise_memory],
    ['Knowledge Graph', provenance?.knowledge_graph],
    ['Learned Corpus', provenance?.learned_corpus],
    ['Cognitive Skills', provenance?.cognitive_skills],
    ['User Memory', provenance?.user_memory],
  ]

  if (provenance?.semantic_cache?.used) {
    material.push(`Semantic Cache — MATERIAL: the recorded answer was reused from cache (${count(provenance.semantic_cache.evidence_count)} cached result${count(provenance.semantic_cache.evidence_count) === 1 ? '' : 's'} contributed).`)
  }

  for (const [label, item] of evidenceRows) {
    const used = Boolean(item?.used) || count(item?.evidence_count) > 0
    const consulted = count(item?.retrieved_count) > 0 || count(item?.selected_count) > 0 || count(item?.injected_count) > 0
    if (used) material.push(`${label} — MATERIAL: ${evidenceWhy(item)}.`)
    else if (consulted) consultedOnly.push(`${label} — consulted, but the record does not mark it as material (${evidenceWhy(item)}).`)
  }

  const originFromCache = Boolean(provenance?.answer_origin?.from_cache)
  if (!originFromCache) {
    material.unshift('User-Supplied Task Context — MATERIAL: the current user prompt supplied the question and any explicit scenario facts or constraints. Those supplied premises are task input, not retrieved external evidence, and must not be attributed to web, memory, or corpus sources.')
  } else {
    consultedOnly.unshift('Current User Prompt — used to select the cached answer, but the cached answer was not freshly synthesized from the current prompt.')
  }
  const externalMaterial = Boolean(provenance?.external_ai?.invoked) && provenance?.external_ai?.accepted !== false
  if (!originFromCache && provenance?.local_reasoning?.invoked && !externalMaterial) {
    material.push(`Local Reasoning Engine — MATERIAL: ${provenance.local_reasoning.model || 'local model'} generated the fresh recorded answer.`)
  }
  if (externalMaterial) {
    material.push(`External AI Provider — MATERIAL: ${provenance.external_ai.provider || 'provider'}${provenance.external_ai.model ? ` / ${provenance.external_ai.model}` : ''} generated the accepted recorded answer.`)
  }
  if (provenance?.deterministic_utility?.used) {
    material.push(`Deterministic Utility — MATERIAL: ${String(provenance.deterministic_utility.utility || 'server utility')} directly produced or constrained the answer.`)
  }
  if (provenance?.live_external_evidence?.used) {
    const sources = Array.isArray(provenance.live_external_evidence.sources) ? provenance.live_external_evidence.sources.length : 0
    material.push(`Live External Evidence — MATERIAL: ${sources} live source${sources === 1 ? '' : 's'} grounded the answer.`)
  }

  const canonical = provenance?.canonical_self_knowledge ?? {}
  if (canonical.used) {
    const definitions = [
      canonical.enterprise_memory_definition ? 'Enterprise Memory definition' : null,
      canonical.semantic_cache_definition ? 'Semantic Cache definition' : null,
    ].filter(Boolean).join(', ')
    material.push(`Canonical Self-Knowledge — MATERIAL: ${definitions || 'recorded canonical definitions'} contributed.`)
  }

  const lines = [
    '',
    'Recorded Influence Interpretation',
    '─────────────────────────────────',
    material.length
      ? `Machine-recorded material influences: ${material.join(' ')}`
      : 'Machine-recorded material influences: none were recorded beyond the answer origin itself.',
  ]

  if (consultedOnly.length) lines.push(`Consulted but not proven material: ${consultedOnly.join(' ')}`)
  if (!provenance?.semantic_cache?.used) lines.push('Semantic Cache was NOT an influence on this answer; the server recorded it as NOT USED.')
  if (!canonical.used) lines.push('Canonical Self-Knowledge was NOT an influence on this answer; the server recorded it as NOT USED.')
  lines.push('Generic prompt heuristics or style rules may have been active policy, but their per-answer materiality is not individually traced. COS must not claim that a specific generic rule influenced this answer unless telemetry records that contribution.')
  return lines.join('\n')
}

export function formatAuthoritativeProvenance(provenance: any, language: string): string {
  let formatted = liveFormatAuthoritativeProvenance(provenance, language)
  const canonical = provenance?.canonical_self_knowledge ?? {}
  const canonicalLine = canonical.used
    ? `Canonical Self-Knowledge: USED — ${[canonical.enterprise_memory_definition ? 'Enterprise Memory definition' : null, canonical.semantic_cache_definition ? 'Semantic Cache definition' : null].filter(Boolean).join(', ')} contributed material to the answer.`
    : 'Canonical Self-Knowledge: NOT USED.'
  formatted = insertBeforeLiveSystemState(formatted, canonicalLine)
  const originFromCache = Boolean(provenance?.answer_origin?.from_cache)
  const suppliedContextLine = originFromCache
    ? 'User-Supplied Task Context: CACHE LOOKUP INPUT — the current prompt selected a previously generated answer; it was not fresh factual grounding for that cached text.'
    : 'User-Supplied Task Context: MATERIAL — the current prompt supplied the question and any explicit scenario facts or constraints; those premises were task input and were not independently sourced from the web or COS memory.'
  formatted = insertBeforeLiveSystemState(formatted, suppliedContextLine)
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
  formatted = insertBeforeLiveSystemState(formatted, recordedInfluenceInterpretation(provenance))
  return formatted
}
