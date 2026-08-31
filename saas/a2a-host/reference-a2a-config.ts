export const REFERENCE_A2A_AGENT_VERSION = '1.0.0' as const

function httpsOrigin(value: string): string {
  const raw = value.trim()
  if (!raw) throw new Error('a2a_reference_origin_unconfigured')
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try { url = new URL(candidate) } catch { throw new Error('a2a_reference_origin_invalid') }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('a2a_reference_origin_invalid')
  return url.origin
}

/** Server-owned origin only. Never derive live acceptance authority from Host/x-forwarded-host/request.nextUrl. */
export function resolveReferenceA2AOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SIGNALBOOST_A2A_REFERENCE_ORIGIN || env.VERCEL_URL || env.VERCEL_PROJECT_PRODUCTION_URL || ''
  return httpsOrigin(configured)
}

export function referenceDiagnosticEndpoint(env: NodeJS.ProcessEnv = process.env): string {
  return new URL('/api/a2a/reference-diagnostic', resolveReferenceA2AOrigin(env)).toString()
}

export function referenceDiagnosticAgentCard(env: NodeJS.ProcessEnv = process.env) {
  return Object.freeze({
    protocolVersion: '0.3.0',
    name: 'SignalBoost Reference Self-Healing Diagnostic Specialist',
    description: 'Read-only reference A2A specialist that classifies incident evidence and recommends bounded next diagnostic checks.',
    url: referenceDiagnosticEndpoint(env),
    preferredTransport: 'JSONRPC',
    version: REFERENCE_A2A_AGENT_VERSION,
    capabilities: Object.freeze({ streaming: false, pushNotifications: false }),
    defaultInputModes: Object.freeze(['text/plain']),
    defaultOutputModes: Object.freeze(['application/json']),
    skills: Object.freeze([Object.freeze({
      id: 'self-healing.diagnose',
      name: 'Diagnose incident evidence',
      description: 'Classify supplied incident evidence and recommend next diagnostic checks without mutating systems.',
      tags: Object.freeze(['self-healing', 'diagnostic', 'advisory', 'reference']),
      inputModes: Object.freeze(['text/plain']),
      outputModes: Object.freeze(['application/json']),
    })]),
  })
}
