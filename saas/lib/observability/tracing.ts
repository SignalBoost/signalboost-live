// saas/lib/observability/tracing.ts
//
// Platform tracing on the OpenTelemetry standard. instrumentation.ts registers the SDK; this module only uses
// @opentelemetry/api, so it has no host coupling and is a no-op where no SDK is registered (tests, scripts, a
// buyer host with its own SDK). The buyer chooses where spans go (Vercel, Datadog, Grafana, Honeycomb, Splunk)
// through standard OpenTelemetry configuration, without code changes.
//
// Spans carry metadata only: never prompts, model replies, source code, secrets or raw tool arguments.

import { context, SpanStatusCode, trace, TraceFlags, type Attributes, type Span } from '@opentelemetry/api'

const tracer = () => trace.getTracer('itmounts')
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/

/** Run `operation` inside a child span of the active trace; a thrown error is recorded on the span and rethrown. */
export function withSpan<T>(name: string, attributes: Attributes, operation: (span: Span) => Promise<T>): Promise<T> {
  return tracer().startActiveSpan(name, { attributes }, async span => {
    try {
      return await operation(span)
    } catch (error) {
      recordSpanError(span, error)
      throw error
    } finally {
      span.end()
    }
  })
}

export function recordSpanError(span: Span | undefined, error: unknown): void {
  if (!span) return
  const err = error instanceof Error ? error : new Error(String(error))
  span.recordException(err)
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message.slice(0, 300) })
}

/** Mark the active span failed for a handled failure that did not throw (a job that ended failed). */
export function markActiveSpanFailed(failureCode: string): void {
  const span = trace.getActiveSpan()
  if (!span) return
  const code = String(failureCode || 'failed').slice(0, 200)
  span.setAttribute('failure.code', code)
  span.setStatus({ code: SpanStatusCode.ERROR, message: code })
}

/** The active trace's id, or null when nothing is being traced. */
export function currentTraceId(): string | null {
  const spanContext = trace.getActiveSpan()?.spanContext()
  return spanContext && trace.isSpanContextValid(spanContext) ? spanContext.traceId : null
}

/** The active span as a W3C traceparent, to continue this trace in work that runs later (a queued job). */
export function currentTraceparent(): string | null {
  const spanContext = trace.getActiveSpan()?.spanContext()
  if (!spanContext || !trace.isSpanContextValid(spanContext)) return null
  return `00-${spanContext.traceId}-${spanContext.spanId}-${(spanContext.traceFlags & 0xff).toString(16).padStart(2, '0')}`
}

/** Run `operation` as part of the trace a stored traceparent names; an absent or malformed one leaves it unchanged. */
export function withTraceparent<T>(traceparent: unknown, operation: () => T): T {
  const match = typeof traceparent === 'string' ? TRACEPARENT.exec(traceparent) : null
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return operation()
  const parent = trace.setSpanContext(context.active(), {
    traceId: match[1], spanId: match[2], isRemote: true,
    traceFlags: Number.parseInt(match[3], 16) & TraceFlags.SAMPLED,
  })
  return context.with(parent, operation)
}
