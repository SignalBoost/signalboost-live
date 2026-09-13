import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { ensureAnswerExecutionProvenance } from './answerProvenance.ts'
import { provenanceBoundarySecret } from './provenanceBoundarySecret.ts'
import { extractPublicRecordedProvenance } from './publicRecordedProvenance.ts'
import { normalizeAssistantContent, type RecordedTurnProvenance } from './supportTurnProvenance.ts'

export type PublicAnswerProvenanceRecord = {
  schema_version: 1
  recorded_at: string
  answer_hash: string
  response_source: string | null
  lineage_completeness: string | null
  local_reasoning: { invoked: boolean; model: null }
  external_ai: { invoked: boolean; provider: null; model: null }
  deterministic_utility: { used: boolean; utility: string | null }
  cache: { used: boolean }
  live_evidence: { used: boolean; sources: Array<{ title: string; url: string }> }
  tools_used: string[]
}

export type PublicAnswerProvenanceCapsule = {
  record: PublicAnswerProvenanceRecord
  signature: string | null
  signed: boolean
}

function cleanText(value: unknown, max = 160): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

function answerHash(answer: string): string {
  return createHash('sha256').update(normalizeAssistantContent(answer)).digest('hex')
}

function canonicalRecord(record: PublicAnswerProvenanceRecord): string {
  return JSON.stringify(record)
}

function signRecord(record: PublicAnswerProvenanceRecord): string | null {
  const key = provenanceBoundarySecret()
  if (!key) return null
  return createHmac('sha256', key).update(canonicalRecord(record)).digest('base64url')
}

function validSignature(record: PublicAnswerProvenanceRecord, signature: string): boolean {
  const expected = signRecord(record)
  if (!expected) return false
  try {
    const left = Buffer.from(expected, 'base64url')
    const right = Buffer.from(signature, 'base64url')
    return left.length === right.length && timingSafeEqual(left, right)
  } catch {
    return false
  }
}

function toolNames(provenance: any): string[] {
  const values = Array.isArray(provenance?.tools_used) ? provenance.tools_used : []
  return values.flatMap((item: any) => {
    const name = cleanText(typeof item === 'string' ? item : item?.name ?? item?.tool ?? item?.function?.name, 120)
    return name ? [name] : []
  }).slice(0, 16)
}

export function createPublicAnswerProvenanceCapsule(payload: any, assistantReply: string): PublicAnswerProvenanceCapsule {
  const provenance = ensureAnswerExecutionProvenance(payload)
  const facts = extractPublicRecordedProvenance(provenance)
  const record: PublicAnswerProvenanceRecord = {
    schema_version: 1,
    recorded_at: new Date().toISOString(),
    answer_hash: answerHash(assistantReply),
    response_source: cleanText((provenance as any)?.response_source ?? (provenance as any)?.responseSource ?? payload?.source, 180),
    lineage_completeness: cleanText((provenance as any)?.lineage_completeness, 80),
    // Public provenance proves the execution class without publishing private model/provider IDs.
    // Authorized internal telemetry retains those identifiers separately.
    local_reasoning: {
      invoked: Boolean((provenance as any)?.local_reasoning?.invoked),
      model: null,
    },
    external_ai: {
      invoked: Boolean((provenance as any)?.external_ai?.invoked),
      provider: null,
      model: null,
    },
    deterministic_utility: {
      used: Boolean((provenance as any)?.deterministic_utility?.used),
      utility: cleanText((provenance as any)?.deterministic_utility?.utility, 160),
    },
    cache: { used: facts.fromCache },
    live_evidence: { used: facts.liveEvidenceUsed, sources: facts.sources.slice(0, 12) },
    tools_used: toolNames(provenance),
  }
  const signature = signRecord(record)
  return { record, signature, signed: Boolean(signature) }
}

export function verifyPublicAnswerProvenanceCapsule(value: unknown, assistantReply: string): PublicAnswerProvenanceCapsule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const capsule = value as any
  const record = capsule.record as PublicAnswerProvenanceRecord | undefined
  const signature = typeof capsule.signature === 'string' ? capsule.signature : ''
  if (!record || record.schema_version !== 1 || !signature) return null
  if (record.answer_hash !== answerHash(assistantReply)) return null
  if (!validSignature(record, signature)) return null
  return { record, signature, signed: true }
}

export function publicAnswerCapsuleAsRecordedProvenance(capsule: PublicAnswerProvenanceCapsule): RecordedTurnProvenance {
  const record = capsule.record
  return {
    authority: 'server_signed_public_answer_provenance',
    schema_version: 5,
    delivery_scope: 'public_concierge',
    response_source: record.response_source,
    lineage_completeness: record.lineage_completeness || 'signed_public_capsule',
    local_reasoning: { ...record.local_reasoning },
    external_ai: { ...record.external_ai },
    deterministic_utility: { ...record.deterministic_utility },
    semantic_cache: { used: record.cache.used, evidence_count: 0 },
    live_external_evidence: {
      used: record.live_evidence.used,
      sources: record.live_evidence.sources,
    },
    tools_used: record.tools_used,
    answer_origin: {
      from_cache: record.cache.used,
      response_source: record.response_source,
    },
    model_generated: record.local_reasoning.invoked || record.external_ai.invoked,
    signed_public_capsule: true,
    recorded_at: record.recorded_at,
  }
}
