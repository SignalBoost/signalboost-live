// saas/lib/security/aiSecurityGateway.ts
// Deterministic AI-content security boundary for untrusted data before model reasoning.
// This module is intentionally not an authorization engine. It sanitizes, labels, and
// quarantines suspicious content; Referee / Agent Gateway / Supervisor policy remain authoritative.

export const AI_SECURITY_GATEWAY_VERSION = 'ai-security-gateway-v1' as const

export type AiSecuritySource =
  | 'connector_output'
  | 'mcp_tool_output'
  | 'retrieved_content'
  | 'external_web'
  | 'user_input'
  | 'model_output'

export type AiSecuritySeverity = 'info' | 'warning' | 'high' | 'critical'
export type AiSecurityDisposition = 'allow' | 'sanitized' | 'quarantined'

export type AiSecurityFindingCode =
  | 'embedded_instruction_override'
  | 'authority_bypass_request'
  | 'credential_exfiltration_request'
  | 'secret_material_redacted'
  | 'private_key_material_redacted'

export interface AiSecurityFinding {
  code: AiSecurityFindingCode
  severity: AiSecuritySeverity
  path: string
  summary: string
}

export interface AiSecurityInspection {
  version: typeof AI_SECURITY_GATEWAY_VERSION
  source: AiSecuritySource
  trust: 'untrusted_data'
  disposition: AiSecurityDisposition
  findings: readonly AiSecurityFinding[]
  sanitized: unknown
  modelData: unknown
  redactedCount: number
}

const SECRET_KEY = /(password|passphrase|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|private[_-]?key|authorization|cookie|session[_-]?token|client[_-]?secret)/i

const SECRET_VALUE_PATTERNS: readonly RegExp[] = Object.freeze([
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /\b(?:sk|xai)-[A-Za-z0-9_-]{16,}\b/gi,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
])

const PRIVATE_KEY = /-----BEGIN(?: RSA| EC| OPENSSH)? PRIVATE KEY-----[\s\S]*?-----END(?: RSA| EC| OPENSSH)? PRIVATE KEY-----/gi

const OVERRIDE_PATTERNS: readonly RegExp[] = Object.freeze([
  // Cover both "ignore previous instructions" and the common nested form
  // "ignore previous system/developer instructions". The latter previously slipped through as only an
  // authority-bypass finding, which downgraded a compound prompt-injection attack to sanitized.
  /\bignore\s+(?:all\s+|any\s+|the\s+)?(?:(?:previous|prior|earlier)\s+(?:(?:system|developer)\s+)?|(?:system|developer)\s+)instructions?\b/i,
  /\bdisregard\s+(?:all\s+|any\s+|the\s+)?(?:(?:previous|prior|earlier)\s+(?:(?:system|developer)\s+)?|(?:system|developer)\s+)instructions?\b/i,
  /\boverride\s+(?:the\s+)?(?:system|developer|security|safety|policy|guardrail)\b/i,
  /\breveal\s+(?:the\s+)?(?:system|developer)\s+(?:prompt|message|instructions?)\b/i,
  /\byou\s+are\s+now\s+(?:the\s+)?system\b/i,
  /\bjailbreak\b/i,
])

const AUTHORITY_BYPASS = /\b(?:bypass|disable|ignore|circumvent|override)\b[\s\S]{0,80}\b(?:approval|authorization|authentication|security|policy|guardrail|referee|permission)\b/i
const EXFILTRATION = /\b(?:reveal|print|show|send|return|exfiltrate|leak|dump)\b[\s\S]{0,80}\b(?:secret|token|password|credential|api key|private key|cookie|session)\b/i

function finding(code: AiSecurityFindingCode, severity: AiSecuritySeverity, path: string, summary: string): AiSecurityFinding {
  return Object.freeze({ code, severity, path, summary })
}

function redactString(input: string, path: string, findings: AiSecurityFinding[]): { value: string; redacted: number } {
  let value = input
  let redacted = 0

  if (PRIVATE_KEY.test(value)) {
    PRIVATE_KEY.lastIndex = 0
    value = value.replace(PRIVATE_KEY, '[REDACTED_PRIVATE_KEY]')
    findings.push(finding('private_key_material_redacted', 'critical', path, 'Private-key material was removed before model reasoning.'))
    redacted += 1
  } else {
    PRIVATE_KEY.lastIndex = 0
  }

  for (const pattern of SECRET_VALUE_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(value)) {
      pattern.lastIndex = 0
      value = value.replace(pattern, '[REDACTED_SECRET]')
      findings.push(finding('secret_material_redacted', 'high', path, 'Secret-like credential material was removed before model reasoning.'))
      redacted += 1
    }
    pattern.lastIndex = 0
  }

  if (OVERRIDE_PATTERNS.some(pattern => pattern.test(value))) {
    findings.push(finding('embedded_instruction_override', 'high', path, 'Untrusted content contains instruction-override language and must be treated only as data.'))
  }
  if (AUTHORITY_BYPASS.test(value)) {
    findings.push(finding('authority_bypass_request', 'high', path, 'Untrusted content asks to bypass an authorization or governance boundary.'))
  }
  if (EXFILTRATION.test(value)) {
    findings.push(finding('credential_exfiltration_request', 'critical', path, 'Untrusted content requests disclosure or exfiltration of credential material.'))
  }

  return { value, redacted }
}

function sanitize(value: unknown, path: string, findings: AiSecurityFinding[], depth: number): { value: unknown; redacted: number } {
  if (depth > 8) return { value: '[depth-limited]', redacted: 0 }
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return { value, redacted: 0 }
  if (typeof value === 'string') return redactString(value, path, findings)
  if (Array.isArray(value)) {
    let redacted = 0
    const out = value.map((entry, index) => {
      const next = sanitize(entry, `${path}[${index}]`, findings, depth + 1)
      redacted += next.redacted
      return next.value
    })
    return { value: out, redacted }
  }
  if (typeof value === 'object') {
    let redacted = 0
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key
      if (SECRET_KEY.test(key)) {
        out[key] = '[REDACTED_SECRET_FIELD]'
        findings.push(finding('secret_material_redacted', 'high', nextPath, 'Secret-bearing field was removed before model reasoning.'))
        redacted += 1
        continue
      }
      const next = sanitize(entry, nextPath, findings, depth + 1)
      redacted += next.redacted
      out[key] = next.value
    }
    return { value: out, redacted }
  }
  return { value: String(value), redacted: 0 }
}

function uniqueFindings(findings: readonly AiSecurityFinding[]): readonly AiSecurityFinding[] {
  const seen = new Set<string>()
  return Object.freeze(findings.filter(item => {
    const key = `${item.code}|${item.path}|${item.summary}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }))
}

export function inspectUntrustedAiContent(input: {
  source: AiSecuritySource
  data: unknown
}): AiSecurityInspection {
  const findings: AiSecurityFinding[] = []
  const sanitized = sanitize(input.data, '$', findings, 0)
  const unique = uniqueFindings(findings)
  const hasOverride = unique.some(item => item.code === 'embedded_instruction_override')
  const hasAuthority = unique.some(item => item.code === 'authority_bypass_request')
  const hasExfiltration = unique.some(item => item.code === 'credential_exfiltration_request')
  const quarantined = hasExfiltration || (hasOverride && hasAuthority)
  const disposition: AiSecurityDisposition = quarantined
    ? 'quarantined'
    : sanitized.redacted > 0 || unique.length > 0
      ? 'sanitized'
      : 'allow'

  const modelData = quarantined
    ? Object.freeze({
        quarantined: true,
        reason: 'ai_security_gateway',
        findingCodes: Object.freeze([...new Set(unique.map(item => item.code))]),
      })
    : sanitized.value

  return Object.freeze({
    version: AI_SECURITY_GATEWAY_VERSION,
    source: input.source,
    trust: 'untrusted_data',
    disposition,
    findings: unique,
    sanitized: sanitized.value,
    modelData,
    redactedCount: sanitized.redacted,
  })
}
