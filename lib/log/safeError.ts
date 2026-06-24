// lib/log/safeError.ts
// Sanitized server-side error logging.
//
// Logging a raw caught value (`console.error('...', err)`) can spill stack
// traces, internal paths, request metadata, or provider error payloads — which
// may carry tokens, headers, or other secrets — into the application logs.
//
// `logServerError` instead emits a single structured line containing ONLY:
//   • a generated correlation id,
//   • a caller-supplied scope string,
//   • the error's constructor name,
//   • a length-bounded message.
// It deliberately does NOT log `err.stack`, enumerate arbitrary own-properties,
// or serialize the whole error object. The returned correlation id can be
// surfaced to the caller so a user/support can reference the incident without
// the server ever exposing internal detail.

const MAX_MESSAGE_LEN = 300

function correlationId(): string {
  try {
    // Available in the Node 18+ and Edge runtimes Next.js targets.
    const g = globalThis as { crypto?: { randomUUID?: () => string } }
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
      return g.crypto.randomUUID()
    }
  } catch {
    // fall through to the manual id below
  }
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function safeName(err: unknown): string {
  if (err instanceof Error && typeof err.name === 'string' && err.name) return err.name
  return typeof err
}

function safeMessage(err: unknown): string {
  let msg: string
  if (err instanceof Error && typeof err.message === 'string') {
    msg = err.message
  } else if (typeof err === 'string') {
    msg = err
  } else {
    // Do NOT JSON.stringify arbitrary objects — they can contain secrets.
    msg = 'non-error value thrown'
  }
  msg = msg.replace(/\s+/g, ' ').trim()
  return msg.length > MAX_MESSAGE_LEN ? `${msg.slice(0, MAX_MESSAGE_LEN)}…` : msg
}

/**
 * Log a sanitized summary of a server-side error and return a correlation id.
 * @param scope short, non-sensitive label for where the error occurred
 *              (e.g. "generate-graphic POST"). Never put request data here.
 */
export function logServerError(scope: string, err: unknown): string {
  const id = correlationId()
  // Single structured, secret-free line.
  console.error(
    JSON.stringify({
      level: 'error',
      scope,
      id,
      name: safeName(err),
      message: safeMessage(err),
    }),
  )
  return id
}
