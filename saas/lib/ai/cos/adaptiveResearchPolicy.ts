// Bounded policy for automatic external-source research after an ordinary COS knowledge miss.
// This module decides only whether a turn is safe/appropriate to RESEARCH. It never answers the
// question and contains no product/vendor-specific answer rules.

const READ_ONLY_KNOWLEDGE_OPENER = /^\s*(?:who|what|when|where|why|how|which|explain|describe|define|compare|summari[sz]e|tell\s+me|is|are|was|were|does|do|did|can|could|should|would)\b/i
const PASTED_OR_STRUCTURED_PAYLOAD = /```|\b(?:request\s+id|stack\s+trace|exception|deployment\s+id)\b|^\s*(?:from|to|subject):/im
const SECRET_SHAPE = /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|secret)\s*[:=]/i
const ACTUAL_EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i

/**
 * Automatic web research is deliberately limited to concise, read-only knowledge questions.
 * Long pasted material, credentials, literal email addresses, and action commands remain on their
 * existing private/governed paths so a timeout can never leak them into a public search query.
 */
export function isReadOnlyKnowledgePrompt(input: unknown): boolean {
  const text = String(input ?? '').trim()
  if (!text || text.length > 600) return false
  if (!READ_ONLY_KNOWLEDGE_OPENER.test(text)) return false
  if (PASTED_OR_STRUCTURED_PAYLOAD.test(text)) return false
  if (SECRET_SHAPE.test(text) || ACTUAL_EMAIL_ADDRESS.test(text)) return false
  return true
}

/**
 * A normal HTTP 200 can still be a COS fail-closed response. Only those explicit reasoning misses
 * are candidates for the read-only research lane; authorization/billing/application failures are
 * intentionally not converted into research.
 */
export function payloadRequestsAdaptiveResearch(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const record = payload as Record<string, unknown>
  const source = String(record.source ?? '').trim().toLowerCase()
  const reason = String(record.reason ?? record.error_code ?? '').trim().toLowerCase()
  if (/auth|forbidden|permission|credit|billing|payment|rate[_ -]?limit/.test(`${source} ${reason}`)) return false
  if (/failed[_ -]?closed|external[_ -]?fallback[_ -]?required|local[_ -]?reasoner[_ -]?(?:no[_ -]?answer|unavailable|exception)|cos[_ -]?(?:timeout|no[_ -]?answer)/.test(`${source} ${reason}`)) return true
  return record.ok === false && /\bcos\b|reasoner|inference/i.test(`${source} ${reason}`)
}
