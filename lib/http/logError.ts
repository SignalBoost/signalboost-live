// lib/http/logError.ts
// Sanitized server-side error logging for API routes.
//
// Exception messages from SDKs, HTTP clients, DB libraries, and providers can
// embed secrets (bearer tokens, API keys, JWTs, signed-URL query params) or PII
// (emails, IPs). Logging the raw message — even truncated — can leak those into
// log sinks. This helper logs a stable correlation ref + the coarse error class
// and a REDACTED, truncated message, so operators keep enough to debug without
// the raw sensitive payload. The full exception object/stack is never logged.

const REDACTION = '[REDACTED]'

// Patterns are intentionally broad — over-redaction in logs is acceptable; a
// leaked secret is not.
const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-]+/gi, // Authorization: Bearer <token>
  /\b(?:sk|pk|rk|whsec|xoxb|xoxp|xoxa|ghp|gho|ghu|ghs|github_pat|AKIA|ASIA)[-_][A-Za-z0-9_\-]{6,}/g, // provider API keys
  /\beyJ[A-Za-z0-9._\-]{10,}/g, // JWTs (header starts with eyJ)
  /[?&](?:sig|signature|token|access[_-]?token|refresh[_-]?token|key|secret|password|passwd|pwd|api[_-]?key|x-amz-[a-z-]+)=[^&\s"']+/gi, // credential-bearing URL params
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, // long base64 runs (keys/blobs)
  /\b[0-9a-fA-F]{32,}\b/g, // long hex (hashes/keys/secrets)
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, // email addresses (PII)
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, // IPv4 addresses (PII)
]

export function redactSecrets(input: string): string {
  let out = input
  for (const re of SECRET_PATTERNS) out = out.replace(re, REDACTION)
  return out
}

/**
 * Logs a sanitized error line and returns a correlation ref to surface to the
 * client (so a user/support can quote it without exposing internals).
 */
export function logSanitizedError(scope: string, err: unknown): string {
  const ref = `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const name = err instanceof Error ? err.name : typeof err
  const raw = err instanceof Error ? err.message : 'non-error thrown'
  const message = redactSecrets(String(raw)).slice(0, 300)
  console.error(`[${scope}] ${ref} ${name}: ${message}`)
  return ref
}
