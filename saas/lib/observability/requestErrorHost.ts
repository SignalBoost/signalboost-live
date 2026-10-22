// saas/lib/observability/requestErrorHost.ts
//
// Host wiring for instrumentation.ts: errors Next.js captures (onRequestError) and requests a route answered with
// HTTP 500 itself (the request-span processor) are written once to the Supervisor ledger. Observability never changes
// the response: a failed write is logged, never thrown.

import { trace } from '@opentelemetry/api'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createPlatformRequestErrorRecorder, recordsSupervisorErrors, type PlatformRequestError } from './requestErrors.ts'
import { createServerErrorSpanProcessor } from './serverErrorSpanProcessor.ts'
import { currentTraceId, recordSpanError } from './tracing.ts'

let recorder: ReturnType<typeof createPlatformRequestErrorRecorder> | null = null

/** One recorder for both sources, so a request is recorded once and the storm bound is shared. */
async function record(input: PlatformRequestError): Promise<void> {
  if (!recordsSupervisorErrors()) return
  try {
    recorder ??= createPlatformRequestErrorRecorder(getAdminSupabase())
    await recorder(input)
  } catch (persistError) {
    console.warn('[platform_request_error_record_failed]', persistError instanceof Error ? persistError.message.slice(0, 160) : 'unknown')
  }
}

/** Requests answered with HTTP 500 by the route itself (instrumentation.ts registers it on the Node.js runtime). */
export function serverErrorSpanProcessor() {
  return createServerErrorSpanProcessor(record)
}

export async function recordCapturedRequestError(
  error: unknown,
  request: Readonly<{ path: string; method: string }>,
  context: Readonly<{ routePath?: string; routeType?: string }>,
): Promise<void> {
  recordSpanError(trace.getActiveSpan(), error)
  await record({
    error, path: request.path, method: request.method,
    routePath: context.routePath, routeType: context.routeType, traceId: currentTraceId(),
  })
}
