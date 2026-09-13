// Server-derived fallback provenance for answer paths that do not already emit a richer execution record.
// This module never asks a model where an answer came from. It records only runtime metadata that
// the server actually observed on the response payload.

import type { RecordedTurnProvenance } from './supportTurnProvenance.ts'

export type AnswerEvidenceSource = { title: string; url: string }

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null
}

function cleanText(value: unknown, max = 160): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validHttpUrl(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return /^https?:\/\/\S+$/i.test(text) ? text : null
}

export function answerEvidenceSources(payload: any): AnswerEvidenceSource[] {
  const execution = asRecord(payload?.execution_provenance)
  const candidates = [
    payload?.live_evidence_sources,
    payload?.sources,
    execution?.live_external_evidence?.sources,
    execution?.fresh_evidence?.sources,
    execution?.freshEvidence?.sources,
    execution?.live_evidence_sources,
    execution?.answer_origin?.live_evidence_sources,
  ]
  const out: AnswerEvidenceSource[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue
    for (const source of candidate) {
      const url = validHttpUrl(source?.url)
      if (!url || seen.has(url)) continue
      seen.add(url)
      out.push({ title: cleanText(source?.title, 180) || url, url })
      if (out.length >= 12) return out
    }
  }
  return out
}

function toolNames(payload: any, execution: Record<string, any> | null): string[] {
  const values = [payload?.tools_used, payload?.tool_calls, execution?.tools_used, execution?.tool_calls]
  const names = new Set<string>()
  for (const value of values) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      const name = cleanText(typeof item === 'string' ? item : item?.name ?? item?.tool ?? item?.function?.name, 120)
      if (name) names.add(name)
      if (names.size >= 16) break
    }
  }
  return [...names]
}

function deterministicSource(source: string): boolean {
  return /^(?:deterministic-|concierge-public-(?:security|output-security)|cos-bounded-timeout|cos-public-safe-fallback|cos-immutable-core-fallback|cos-prospect-campaign|cos-press-campaign|concierge-operational-log-analysis)/i.test(source)
}

/**
 * Return a real execution provenance object for every answer payload. Rich provenance produced by
 * COS is preserved. When a route omitted one, a bounded server-observed record is created instead
 * of leaving the answer provenance-less or asking the model to reconstruct its own history later.
 */
export function ensureAnswerExecutionProvenance(payload: any): RecordedTurnProvenance {
  const existing = asRecord(payload?.execution_provenance)
  const source = cleanText(payload?.source ?? payload?.telemetry?.source, 180)
  const sources = answerEvidenceSources(payload)

  if (existing) {
    const live = asRecord(existing.live_external_evidence)
    return {
      ...existing,
      ...(existing.response_source || !source ? {} : { response_source: source }),
      ...(live || sources.length === 0 ? {} : { live_external_evidence: { used: true, sources } }),
      ...(existing.lineage_completeness ? {} : { lineage_completeness: 'runtime_recorded' }),
    }
  }

  const localInvoked = payload?.local_model_invoked === true
  const externalInvoked = payload?.external_ai_invoked === true || payload?.external_fallback_invoked === true
  const fromCache = payload?.from_cache === true || payload?.cache_hit === true || payload?.answer_origin?.from_cache === true
  const liveEvidenceUsed = payload?.live_evidence_used === true || sources.length > 0
  const deterministicUsed = deterministicSource(source || '') || (!localInvoked && !externalInvoked && !liveEvidenceUsed && Boolean(source))
  const provider = cleanText(payload?.provider ?? payload?.ai_provider ?? payload?.external_provider, 100)
  const model = cleanText(payload?.reasoner_label ?? payload?.model ?? payload?.ai_model ?? payload?.external_model, 140)

  return {
    authority: 'server_execution_telemetry',
    schema_version: 5,
    response_source: source,
    lineage_completeness: 'runtime_metadata_fallback',
    local_reasoning: {
      invoked: localInvoked,
      model: localInvoked ? model : null,
      confidence: finiteNumber(payload?.confidence_score ?? payload?.confidence),
      threshold: finiteNumber(payload?.confidence_threshold),
    },
    external_ai: {
      invoked: externalInvoked,
      provider: externalInvoked ? provider : null,
      model: externalInvoked ? model : null,
    },
    deterministic_utility: {
      used: deterministicUsed,
      utility: deterministicUsed ? source : null,
    },
    semantic_cache: { used: fromCache, evidence_count: 0 },
    live_external_evidence: {
      used: liveEvidenceUsed,
      sources,
    },
    tools_used: toolNames(payload, existing),
    answer_origin: {
      from_cache: fromCache,
      response_source: source,
    },
    model_generated: localInvoked || externalInvoked,
  }
}
