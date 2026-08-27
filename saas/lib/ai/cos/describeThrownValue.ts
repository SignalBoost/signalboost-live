// saas/lib/ai/cos/describeThrownValue.ts
//
// `String(error)` ON A THROWN OBJECT PRINTS "[object Object]".
//
// Production, 2026-08-27: /api/cron/cos-directed-study-promotion returned 503 on every run for at
// least twelve hours, roughly ninety-six consecutive failures, and every one logged:
//
//   [cos-learning-auto-promotion-failed] [object Object]
//
// The catch block was already careful — `error instanceof Error ? error.message : String(error)` —
// but Supabase rejects with a PLAIN OBJECT ({ message, details, hint, code }), not an Error. It
// fails the instanceof check, falls to String(), and the actual cause is destroyed at the moment
// it is recorded. Twelve hours of a broken promotion pipeline produced no diagnosable evidence.
//
// This is the same shape as a defect already recorded in this codebase, where a Supabase error was
// coerced to an object string and the useful message was lost. The pattern
// `instanceof Error ? .message : String(error)` appears about 99 times here; each one is a place a
// thrown object would be silently discarded.
//
// Zero imports.

/** Fields carrying a human-readable cause on the error shapes this codebase actually throws. */
const MESSAGE_FIELDS = ['message', 'error_description', 'error', 'details', 'hint', 'code'] as const

/**
 * Describe any thrown value in a form worth logging.
 *
 * Errors keep their message. Plain objects — Supabase results, fetch failures, API envelopes —
 * are unwrapped field by field, then JSON as a fallback. Nothing ever degrades to "[object
 * Object]": if every strategy fails, the constructor name is at least a lead.
 */
export function describeThrownValue(error: unknown, maxLength = 2000): string {
  if (error instanceof Error) {
    const message = error.message.trim()
    // A wrapped cause is usually where the real reason lives.
    const cause = (error as { cause?: unknown }).cause
    if (cause && cause !== error) {
      const causeText = describeThrownValue(cause, 400)
      if (causeText && !message.includes(causeText)) {
        return `${message || error.name} (cause: ${causeText})`.slice(0, maxLength)
      }
    }
    return (message || error.name || 'Error').slice(0, maxLength)
  }

  if (typeof error === 'string') return error.slice(0, maxLength)
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error)
  }
  if (error === null) return 'null'
  if (error === undefined) return 'undefined'

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    const parts: string[] = []
    for (const field of MESSAGE_FIELDS) {
      const value = record[field]
      if (value == null) continue
      const text = typeof value === 'string' ? value.trim() : describeThrownValue(value, 300)
      if (text && !parts.includes(text)) parts.push(`${field}=${text}`)
    }
    if (parts.length) return parts.join(' | ').slice(0, maxLength)

    try {
      const json = JSON.stringify(error)
      if (json && json !== '{}') return json.slice(0, maxLength)
    } catch {
      // circular or non-serialisable — fall through
    }
    const name = (error as { constructor?: { name?: string } })?.constructor?.name
    return name && name !== 'Object' ? `unserialisable ${name}` : 'unserialisable object'
  }

  return String(error).slice(0, maxLength)
}
