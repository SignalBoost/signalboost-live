// saas/instrumentation.ts
//
// Platform-wide observability on the OpenTelemetry standard (Next.js instrumentation hook).
// - register: every route, page, server action and outbound fetch (GitHub, Vercel, model providers) becomes a span.
//   On Vercel the traces appear under Logs → Traces once a sampling rule is set; any other backend is chosen with
//   the standard OpenTelemetry settings (OTEL_EXPORTER_OTLP_*, OTEL_SERVICE_NAME) or a Vercel Trace Drain.
// - onRequestError: every server error Next.js captures is recorded on its trace and durably in the Supervisor's
//   ledger, where the Self-Healing Supervisor picks it up as an incident to repair.

import { registerOTel } from '@vercel/otel'
import type { Instrumentation } from 'next'

export function register() {
  registerOTel({ serviceName: 'itmounts' })
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { recordCapturedRequestError } = await import('./lib/observability/requestErrorHost.ts')
  await recordCapturedRequestError(error, request, context)
}
