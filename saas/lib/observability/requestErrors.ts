// saas/lib/observability/requestErrors.ts
//
// Durable record of a server error Next.js captured (instrumentation.ts onRequestError) in the Supervisor's
// existing immutable ledger (supervisor_audit_events), keyed by trace id, so it can still be analysed after the
// trace store's retention ends and joined to the model calls and Builder job of the same trace.
// Stores the route and a redacted error only: never the query string, headers, body or a stack trace.

import { sanitizeError } from '../supervisor/persistence/redaction.ts'

export const PLATFORM_REQUEST_ERROR_EVENT = 'platform_request_error'
/** The same failure (route + error) on one instance is recorded at most once per window; a storm stays bounded. */
export const PLATFORM_REQUEST_ERROR_WINDOW_MS = 60_000

type UpsertResult = { error?: { message?: string } | null }
export type RequestErrorLedger = {
  from(table: string): { upsert(value: unknown, options: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<UpsertResult> }
}

export type PlatformRequestError = Readonly<{
  error: unknown
  path: string
  method: string
  routePath?: string
  routeType?: string
  traceId: string | null
  at?: Date
}>

function digestOf(error: unknown): string | null {
  const digest = (error as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && digest ? digest.slice(0, 80) : null
}

export function createPlatformRequestErrorRecorder(db: RequestErrorLedger, now: () => number = Date.now) {
  const lastRecorded = new Map<string, number>()
  return async function recordPlatformRequestError(input: PlatformRequestError): Promise<'recorded' | 'throttled'> {
    const at = input.at ?? new Date(now())
    const pathname = String(input.path || '').split(/[?#]/, 1)[0].slice(0, 300) || '/'
    const routePath = String(input.routePath || pathname).slice(0, 300)
    const { code, message } = sanitizeError(input.error)
    const fingerprint = `${routePath}|${code}|${message.slice(0, 120)}`
    const previous = lastRecorded.get(fingerprint)
    if (previous !== undefined && at.getTime() - previous < PLATFORM_REQUEST_ERROR_WINDOW_MS) return 'throttled'
    lastRecorded.set(fingerprint, at.getTime())
    if (lastRecorded.size > 500) lastRecorded.delete(lastRecorded.keys().next().value as string)
    const digest = digestOf(input.error)
    const key = input.traceId || digest || `${fingerprint}|${Math.floor(at.getTime() / PLATFORM_REQUEST_ERROR_WINDOW_MS)}`
    const { error } = await db.from('supervisor_audit_events').upsert({
      event_id: `${PLATFORM_REQUEST_ERROR_EVENT}:${key}`.slice(0, 400),
      incident_id: input.traceId || digest || 'untraced',
      event_type: PLATFORM_REQUEST_ERROR_EVENT,
      occurred_at: at.toISOString(),
      payload: {
        traceId: input.traceId,
        method: String(input.method || '').toUpperCase().slice(0, 10),
        path: pathname,
        routePath,
        routeType: String(input.routeType || '').slice(0, 20) || null,
        errorCode: code,
        errorMessage: message,
        digest,
      },
      schema_version: 'platform-request-error-v1',
    }, { onConflict: 'event_id', ignoreDuplicates: true })
    if (error) throw new Error('platform_request_error_persist_failed')
    return 'recorded'
  }
}
