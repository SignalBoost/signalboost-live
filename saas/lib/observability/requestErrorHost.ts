// saas/lib/observability/requestErrorHost.ts
//
// Host wiring for instrumentation.ts onRequestError: the error is marked on the active span and written once to
// the Supervisor ledger. Observability never changes the response: a failed write is logged, never thrown.

import { trace } from '@opentelemetry/api'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createPlatformRequestErrorRecorder } from './requestErrors.ts'
import { currentTraceId, recordSpanError } from './tracing.ts'

let recorder: ReturnType<typeof createPlatformRequestErrorRecorder> | null = null

export async function recordCapturedRequestError(
  error: unknown,
  request: Readonly<{ path: string; method: string }>,
  context: Readonly<{ routePath?: string; routeType?: string }>,
): Promise<void> {
  recordSpanError(trace.getActiveSpan(), error)
  try {
    recorder ??= createPlatformRequestErrorRecorder(getAdminSupabase())
    await recorder({
      error, path: request.path, method: request.method,
      routePath: context.routePath, routeType: context.routeType, traceId: currentTraceId(),
    })
  } catch (persistError) {
    console.warn('[platform_request_error_record_failed]', persistError instanceof Error ? persistError.message.slice(0, 160) : 'unknown')
  }
}
