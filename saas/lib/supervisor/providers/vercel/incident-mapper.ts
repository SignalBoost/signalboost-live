import { createHash } from 'crypto'
import { incidentSchema, type SupervisorIncident, type SerializableValue } from '../../incident-schema.ts'
import { normalizeEnvironment, timestampMs } from './deployment-classifier.ts'
import type { NormalizedDeploymentState, VercelDeployment, VercelEnvironment, VercelObserverConfig } from './vercel-types.ts'
import { VercelObserverError } from './errors.ts'

const TOKEN = /Bearer\s+[A-Za-z0-9._~+/=-]+|Authorization\s*:\s*[^\n\r]+|Cookie\s*:\s*[^\n\r]+|(?:vercel|api|access|auth)?_?token\s*[=:]\s*[^\s,;]+/gi
const ENV_ASSIGNMENT = /\b[A-Z][A-Z0-9_]{2,}\s*=\s*[^\s,;]+/g
function hash(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 16) }
export function sanitizeString(value: unknown, max = 600): string {
  let text = String(value ?? '')
  text = text.replace(/\bat\b[\s\S]*$/i, '').replace(TOKEN, '[REDACTED]').replace(ENV_ASSIGNMENT, m => `${m.split('=')[0].trim()}=[REDACTED]`)
  return text.length > max ? `${text.slice(0, max)}…` : text
}
export function safeUrl(value: unknown): string | undefined {
  const text = sanitizeString(value, 240).trim()
  if (!text || /\[REDACTED\]/.test(text)) return undefined
  try { const url = new URL(text.startsWith('http') ? text : `https://${text}`); if (url.protocol === 'https:') return url.toString() } catch {}
  return undefined
}
function iso(value: number | string | null | undefined): string | undefined { const ms = timestampMs(value); return ms === undefined ? undefined : new Date(ms).toISOString() }
function severity(kind: 'failed'|'repeated'|'stuck'|'canceled'|'unknown'|'auth'|'unavailable', env: VercelEnvironment): SupervisorIncident['severity'] {
  if (kind === 'auth') return 'critical'
  if ((kind === 'failed' || kind === 'repeated' || kind === 'stuck') && env === 'production') return 'critical'
  return 'warning'
}
function base(key: string, cfg: VercelObserverConfig, env: VercelEnvironment, kind: string, message: string, metadata: Record<string, SerializableValue>, deploymentId?: string): SupervisorIncident {
  return incidentSchema.parse({ incidentId: key, provider: 'vercel', environment: env, severity: severity(kind as any, env), detectedAt: cfg.clock.now().toISOString(), source: 'api', errorCode: `VERCEL_${kind.toUpperCase()}`, errorMessage: sanitizeString(message), affectedResource: deploymentId || cfg.projectId, evidence: [{ evidenceId: `${key}:evidence`, type: 'provider_observation', capturedAt: cfg.clock.now().toISOString(), summary: sanitizeString(message), reference: deploymentId }], metadata: { providerConnectionId: cfg.providerConnectionId, projectId: cfg.projectId, fingerprint: hash(key), ...metadata } })
}
export function failedDeploymentIncident(cfg: VercelObserverConfig, d: VercelDeployment): SupervisorIncident {
  const env = normalizeEnvironment(d, cfg.environment); const error = typeof d.error === 'string' ? { message: d.error } : (d.error || {})
  return base(`vercel:${cfg.projectId}:${d.id}:failed_deployment`, cfg, env, 'failed', `Vercel deployment ${d.id} failed.`, { incidentType: 'failed_deployment', deploymentId: d.id, providerState: sanitizeString(d.state, 80), createdAt: iso(d.createdAt) || '', completedAt: iso(d.ready) || '', sanitizedErrorCode: sanitizeString(error.code, 120), sanitizedErrorMessage: sanitizeString(error.message, 300), deploymentUrl: safeUrl(d.url) || '', commitSha: sanitizeString(d.meta?.githubCommitSha, 80), branchName: sanitizeString(d.meta?.githubCommitRef, 160) }, d.id)
}
export function repeatedFailureIncident(cfg: VercelObserverConfig, failures: VercelDeployment[], states: NormalizedDeploymentState[]): SupervisorIncident {
  const env = normalizeEnvironment(failures[0], cfg.environment); const ids = failures.map(d => d.id); const fp = hash(ids.join('|'))
  return base(`vercel:${cfg.projectId}:${env}:repeated_failure:${fp}`, cfg, env, 'repeated', `${ids.length} consecutive Vercel deployments failed for ${env}.`, { incidentType: 'repeated_deployment_failure', deploymentIds: ids, normalizedStates: states, threshold: cfg.repeatedFailureThreshold, sequenceFingerprint: fp })
}
export function stuckDeploymentIncident(cfg: VercelObserverConfig, d: VercelDeployment): SupervisorIncident {
  const env = normalizeEnvironment(d, cfg.environment)
  return base(`vercel:${cfg.projectId}:${d.id}:stuck:${cfg.stuckDeploymentThresholdMs}`, cfg, env, 'stuck', `Vercel deployment ${d.id} is still ${sanitizeString(d.state, 80)} beyond the configured threshold.`, { incidentType: 'stuck_deployment', deploymentId: d.id, providerState: sanitizeString(d.state, 80), createdAt: iso(d.createdAt) || '', thresholdMs: cfg.stuckDeploymentThresholdMs }, d.id)
}
export function canceledProductionIncident(cfg: VercelObserverConfig, d: VercelDeployment): SupervisorIncident { return base(`vercel:${cfg.projectId}:${d.id}:canceled_production`, cfg, 'production', 'canceled', `Production deployment ${d.id} was canceled.`, { incidentType: 'canceled_production_deployment', deploymentId: d.id, providerState: sanitizeString(d.state, 80) }, d.id) }
export function unknownStateIncident(cfg: VercelObserverConfig, d: VercelDeployment): SupervisorIncident { const env = normalizeEnvironment(d, cfg.environment); return base(`vercel:${cfg.projectId}:${d.id}:unknown_state`, cfg, env, 'unknown', `Vercel returned an unknown deployment state for ${d.id}.`, { incidentType: 'unknown_provider_state', deploymentId: d.id, rawState: sanitizeString(d.state, 80) }, d.id) }
export function providerErrorIncident(cfg: VercelObserverConfig, error: unknown): SupervisorIncident { const e = error instanceof VercelObserverError ? error : new VercelObserverError('Provider request failed.', 'unavailable'); const kind = e.category === 'auth' ? 'auth' : 'unavailable'; return base(`vercel:${cfg.providerConnectionId}:${kind}`, cfg, cfg.environment, kind, kind === 'auth' ? 'Vercel API authentication or authorization failed.' : 'Vercel API was unavailable after bounded retries.', { incidentType: kind === 'auth' ? 'provider_connection_failure' : 'provider_api_unavailable', status: e.status || 0, retryAfterMs: e.retryAfterMs || 0, category: e.category }) }
