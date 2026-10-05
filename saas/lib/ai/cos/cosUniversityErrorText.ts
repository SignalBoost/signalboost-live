// saas/lib/ai/cos/cosUniversityErrorText.ts
//
// Readable text for any thrown or returned error (pure; safe for the plain `node --test` gate).
//
// The University telemetry reports read Supabase through PostgREST, whose failures arrive as plain objects
// ({ message, code, details, hint }), not Error instances. `String(error)` turned those into "[object Object]" on the
// telemetry page ("Observed throughput & recovery"), hiding which table failed and why. This names the code, message and
// details instead, and never prints "[object Object]".

export function errorText(error: unknown, max = 300): string {
  const clip = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, max)
  if (error instanceof Error) return clip(error.message || error.name || 'Error')
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; code?: unknown; details?: unknown }
    const message = typeof record.message === 'string' ? record.message.trim() : ''
    const code = typeof record.code === 'string' || typeof record.code === 'number' ? String(record.code).trim() : ''
    const details = typeof record.details === 'string' ? record.details.trim() : ''
    const described = [code && message ? `${code}: ${message}` : code || message, details ? `(${details})` : '']
      .filter(Boolean).join(' ')
    if (described) return clip(described)
    try {
      const json = JSON.stringify(error)
      if (json && json !== '{}') return clip(json)
    } catch {
      // Circular or otherwise unserializable: fall through to the generic name.
    }
    return 'unreadable_error_object'
  }
  return clip(String(error ?? ''))
}

// end of saas/lib/ai/cos/cosUniversityErrorText.ts (if this line is missing, the paste was cut short)
