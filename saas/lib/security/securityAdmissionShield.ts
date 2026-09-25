// saas/lib/security/securityAdmissionShield.ts
// Deterministic front-door admission checks for AI-facing HTTP ingress.
// This layer deliberately does not score people, IP geography, language, VPN use, writing style,
// or prompt vocabulary. It rejects only protocol/payload conditions that are unsafe regardless of intent.
export const SECURITY_ADMISSION_SHIELD_VERSION = 'security-admission-shield-v1' as const

export type SecurityAdmissionDisposition = 'allow' | 'reject'

export type SecurityAdmissionDecision = Readonly<{
  version: typeof SECURITY_ADMISSION_SHIELD_VERSION
  disposition: SecurityAdmissionDisposition
  status: 200 | 400 | 413 | 415
  reason: 'not_ai_ingress' | 'admitted' | 'malformed_content_length' | 'payload_too_large' | 'unsupported_content_type'
}>

const AI_INGRESS_PATHS = new Set([
  '/api/concierge',
  '/api/cos-browser',
  '/api/cos-primary',
  '/api/support',
])

/**
 * AI-facing POST routes that read a JSON body and reach model reasoning, but were outside the proxy
 * matcher and therefore never crossed the Admission Shield. Proxy admits them and then passes them
 * straight through (they do NOT enter proxyBase), so their existing behaviour is unchanged apart from
 * the deterministic size/encoding checks. Each route was checked to parse only request.json().
 */
export const SHIELD_ONLY_AI_INGRESS_PATHS: readonly string[] = Object.freeze([
  '/api/builder',
  '/api/cos-specialist',
  '/api/cos/run',
  '/api/cos-fast-transform',
  '/api/cos-provenance-browser',
  '/api/artifacts',
  '/api/items/generate',
  '/api/sites/generate',
  '/api/outreach/analyze',
  '/api/outreach/deck',
  '/api/visuals',
  '/api/assistant/feedback',
  '/api/a2a/qualification-assessment',
  '/api/a2a/reference-diagnostic',
  '/api/a2a/reference-diagnostic-secondary',
  '/api/a2a/reference-write-acceptance-primary',
  '/api/a2a/reference-write-acceptance-secondary',
])
const SHIELD_ONLY_SET = new Set(SHIELD_ONLY_AI_INGRESS_PATHS)

export function isShieldOnlyAiIngress(pathname: string, method: string): boolean {
  return String(method || '').toUpperCase() === 'POST' && SHIELD_ONLY_SET.has(String(pathname || ''))
}

// Keep the ceiling below common serverless request limits, but large enough for long legitimate
// conversations and attachment metadata. Binary uploads use their dedicated upload paths instead.
export const AI_INGRESS_MAX_BODY_BYTES = 4 * 1024 * 1024

function allow(reason: SecurityAdmissionDecision['reason']): SecurityAdmissionDecision {
  return Object.freeze({ version: SECURITY_ADMISSION_SHIELD_VERSION, disposition: 'allow', status: 200, reason })
}

function reject(status: 400 | 413 | 415, reason: SecurityAdmissionDecision['reason']): SecurityAdmissionDecision {
  return Object.freeze({ version: SECURITY_ADMISSION_SHIELD_VERSION, disposition: 'reject', status, reason })
}

function jsonContentType(value: string): boolean {
  const type = value.split(';', 1)[0]?.trim().toLowerCase() || ''
  return type === 'application/json' || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(type)
}

// fetch() with a string body and no explicit header sends text/plain;charset=UTF-8. The newly covered
// routes predate the Shield, so their clients may rely on that default; rejecting it would lock out
// legitimate users. The route's JSON parser stays authoritative for text/plain bodies.
function plainTextContentType(value: string): boolean {
  return (value.split(';', 1)[0]?.trim().toLowerCase() || '') === 'text/plain'
}

export function evaluateSecurityAdmission(input: {
  pathname: string
  method: string
  contentType?: string | null
  contentLength?: string | null
}): SecurityAdmissionDecision {
  const pathname = String(input.pathname || '')
  const shieldOnly = isShieldOnlyAiIngress(pathname, input.method)
  if (String(input.method || '').toUpperCase() !== 'POST' || (!AI_INGRESS_PATHS.has(pathname) && !shieldOnly)) {
    return allow('not_ai_ingress')
  }

  const length = String(input.contentLength || '').trim()
  if (length) {
    if (!/^\d+$/.test(length)) return reject(400, 'malformed_content_length')
    const numeric = Number(length)
    if (!Number.isSafeInteger(numeric) || numeric < 0) return reject(400, 'malformed_content_length')
    if (numeric > AI_INGRESS_MAX_BODY_BYTES) return reject(413, 'payload_too_large')
  }

  // Some same-origin clients/platform rewrites omit Content-Type. Do not lock them out merely for
  // the missing header; the downstream JSON parser remains authoritative. If a type is explicitly
  // declared, however, an AI JSON route must not accept an unrelated binary/form encoding.
  const contentType = String(input.contentType || '').trim()
  if (contentType && !jsonContentType(contentType) && !(shieldOnly && plainTextContentType(contentType))) {
    return reject(415, 'unsupported_content_type')
  }

  return allow('admitted')
}
