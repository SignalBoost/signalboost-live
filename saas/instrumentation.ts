// saas/instrumentation.ts
//
// Platform-wide observability on the OpenTelemetry standard (Next.js instrumentation hook).
// - register: every route, page, server action and outbound fetch (GitHub, Vercel, model providers) becomes a span.
//   On Vercel the traces appear under Logs → Traces once a sampling rule is set; any other backend is chosen with
//   the standard OpenTelemetry settings (OTEL_EXPORTER_OTLP_*, OTEL_SERVICE_NAME) or a Vercel Trace Drain.
// - Every server error is recorded on its trace and durably in the Supervisor's ledger, where the Self-Healing
//   Supervisor picks it up as an incident to repair: errors Next.js captures (onRequestError) and, on the Node.js
//   runtime, requests a route answered with HTTP 500 itself (serverErrorSpanProcessor).
// - Every request is recorded by the SDK (always_on) so no 500 is missed; what Vercel keeps and bills is still decided
//   by the project's sampling rules ("spans indexed after sampling").

import { registerOTel, type SpanProcessorOrName } from '@vercel/otel'
import type { Instrumentation } from 'next'

export async function register() {
  const spanProcessors: SpanProcessorOrName[] = ['auto']
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Observability never stops the server from starting: without the processor, tracing still runs.
    try {
      const { serverErrorSpanProcessor } = await import('./lib/observability/requestErrorHost.ts')
      spanProcessors.push(serverErrorSpanProcessor())
    } catch (error) {
      console.error('[instrumentation_server_error_processor_unavailable]', error instanceof Error ? error.message.slice(0, 200) : 'unknown')
    }
  }
  registerOTel({ serviceName: 'itmounts', traceSampler: 'always_on', spanProcessors })
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { recordCapturedRequestError } = await import('./lib/observability/requestErrorHost.ts')
  await recordCapturedRequestError(error, request, context)
}
