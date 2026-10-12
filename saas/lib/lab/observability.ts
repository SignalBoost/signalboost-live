// LAB request-level operational telemetry. No customer IDs, request bodies, tokens,
// URLs, models, prompts, secrets, or raw exception messages are logged.
// Vercel runtime logs can be filtered for `event: "lab_request"`.
import { randomUUID } from 'node:crypto'

const allowed = new Set([
  'workspace.create', 'providers.list', 'providers.save', 'providers.revoke',
  'training.list', 'training.action', 'training.callback', 'artifact.download', 'openSources.find',
])

export async function observeLabRequest<T extends Response>(
  operation: string,
  handler: () => Promise<T>,
): Promise<T> {
  if (!allowed.has(operation)) throw new Error('unknown_lab_observation_operation')
  const observationId = randomUUID()
  const started = Date.now()
  let status = 500
  let outcome: 'response' | 'exception' = 'exception'
  try {
    const response = await handler()
    status = response.status
    outcome = 'response'
    // Response headers contain a correlation handle for a customer support report,
    // without exposing customer identifiers or sensitive request data.
    try { response.headers.set('x-lab-observation-id', observationId) } catch { /* immutable header */ }
    return response
  } finally {
    const durationMs = Math.max(0, Date.now() - started)
    const severity = status >= 500 ? 'error' : status >= 400 ? 'warning' : 'info'
    const record = {
      event: 'lab_request',
      version: 1,
      operation,
      observationId,
      status,
      outcome,
      durationMs,
      severity,
      environment: process.env.VERCEL_ENV === 'production' ? 'production' : 'nonproduction',
    }
    // Explicit structured console output is collected by Vercel Runtime Logs.
    // Do not add arbitrary exception data or Supabase error details here.
    console.log(JSON.stringify(record))
  }
}
