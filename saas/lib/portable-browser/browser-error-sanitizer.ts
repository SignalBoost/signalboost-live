// saas/lib/portable-browser/browser-error-sanitizer.ts
//
// Moved in from lib/browser-runtime/ so every shipped adapter remains self-contained inside
// the portable package. The host path now re-exports this module.

const REDACTED = '[redacted]'
const MAX_ERROR_LENGTH = 600
const SENSITIVE_ASSIGNMENT = /((?:"|')?(?:authorization|cookie|password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret)(?:"|')?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  if (typeof error === 'string') return error
  return 'Unknown browser runtime error'
}

function redactKnownSecrets(message: string, knownSecrets: Iterable<string>): string {
  const values = [...knownSecrets]
    .filter(value => typeof value === 'string' && value.length > 0)
    .sort((left, right) => right.length - left.length)

  let sanitized = message
  for (const value of values) {
    if (value.length < 4) {
      if (sanitized === value) sanitized = REDACTED
      continue
    }
    sanitized = sanitized.split(value).join(REDACTED)
  }
  return sanitized
}

function redactSensitiveAssignment(
  _match: string,
  prefix: string,
  value: string,
): string {
  const quote = value[0] === '"' || value[0] === "'" ? value[0] : ''
  return `${prefix}${quote}${REDACTED}${quote}`
}

/**
 * Produces the only error text permitted to leave Browser Runtime.
 *
 * The sanitizer removes exact in-memory approval/credential values, common
 * credential formats, URL credentials and sensitive query parameters, stack
 * frames, control characters, and unbounded provider/engine output.
 */
export function sanitizeBrowserRuntimeError(
  error: unknown,
  knownSecrets: Iterable<string> = [],
): string {
  let sanitized = redactKnownSecrets(errorMessage(error), knownSecrets)

  sanitized = sanitized
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, REDACTED)
    .replace(/\bbearer\s+[a-z0-9._~+\/-]+=*/gi, `Bearer ${REDACTED}`)
    .replace(/\bsk-[a-z0-9_-]{12,}\b/gi, REDACTED)
    .replace(/\bxox[baprs]-[a-z0-9-]+\b/gi, REDACTED)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s\/@:]+:[^\s\/@]+@/gi, `$1${REDACTED}@`)
    .replace(/([?&](?:token|key|secret|password|access_token|refresh_token|api_key)=)[^&#\s]+/gi, `$1${REDACTED}`)
    .replace(SENSITIVE_ASSIGNMENT, redactSensitiveAssignment)
    .replace(/\r?\n\s*at\s+[^\r\n]+/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!sanitized) return 'Unknown browser runtime error'
  return sanitized.slice(0, MAX_ERROR_LENGTH)
}

export { MAX_ERROR_LENGTH as BROWSER_RUNTIME_MAX_ERROR_LENGTH, REDACTED as BROWSER_RUNTIME_REDACTED }
