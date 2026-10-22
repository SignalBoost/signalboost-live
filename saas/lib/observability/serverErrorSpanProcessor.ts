// saas/lib/observability/serverErrorSpanProcessor.ts
//
// Records every request that ended in HTTP 500, including those a route caught and answered with a 500 itself
// (onRequestError only sees errors Next.js captures). It reads the Next.js request span (BaseServer.handleRequest)
// when it ends. Only 500 counts: 502/503/504 are deliberate fail-closed answers in this codebase (a provider or probe
// unavailable), not defects. Writes in flight are awaited by forceFlush, which the SDK calls before the function ends.

import { SpanKind } from '@opentelemetry/api'
import type { Context } from '@opentelemetry/api'
import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { PlatformRequestError } from './requestErrors.ts'

const NEXT_REQUEST_SPAN = 'BaseServer.handleRequest'

/** The recordable 500 of a finished Next.js request span, or null for any other span or status. */
export function serverErrorFromSpan(span: ReadableSpan): PlatformRequestError | null {
  const attributes = span.attributes
  if (span.kind !== SpanKind.SERVER || attributes['next.span_type'] !== NEXT_REQUEST_SPAN) return null
  if (Number(attributes['http.status_code']) !== 500) return null
  const method = String(attributes['http.method'] || 'GET')
  const route = String(attributes['next.route'] || attributes['http.route'] || '')
  // Query and fragment never leave the request (they can carry emails, searches or tokens).
  const path = String(attributes['http.target'] || route || '/').split(/[?#]/, 1)[0] || '/'
  const error = new Error(`${method} ${route || path} responded 500 Internal Server Error`)
  error.name = 'http_500'
  return {
    error, path, method,
    routePath: route ? `/app${route}` : undefined,
    routeType: 'response',
    traceId: span.spanContext().traceId,
  }
}

export function createServerErrorSpanProcessor(record: (input: PlatformRequestError) => Promise<unknown>): SpanProcessor {
  const pending = new Set<Promise<unknown>>()
  const settle = async () => { await Promise.allSettled([...pending]) }
  return {
    onStart(_span: Span, _context: Context) {},
    onEnd(span: ReadableSpan) {
      const input = serverErrorFromSpan(span)
      if (!input) return
      const write = record(input).catch(() => undefined).finally(() => pending.delete(write))
      pending.add(write)
    },
    forceFlush: settle,
    shutdown: settle,
  }
}
