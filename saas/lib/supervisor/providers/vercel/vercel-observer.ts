import type { Observer, ProviderObservationContext } from '../../execution-contracts.ts'
import { incidentSchema, type SupervisorIncident } from '../../incident-schema.ts'
import { normalizeDeploymentState, isStuck } from './deployment-classifier.ts'
import { failedDeploymentIncident, repeatedFailureIncident, stuckDeploymentIncident, canceledProductionIncident, unknownStateIncident, providerErrorIncident } from './incident-mapper.ts'
import { isAuthError, isRetryableProviderError, VercelObserverError } from './errors.ts'
import type { VercelObservationDeps, VercelObserverConfig, VercelDeployment } from './vercel-types.ts'

function validateConfig(cfg: VercelObserverConfig): void {
  if (!cfg.providerConnectionId || !cfg.projectId) throw new VercelObserverError('Missing Vercel observer connection or project configuration.', 'invalid_config')
  for (const [name, value] of Object.entries({ lookbackWindowMs: cfg.lookbackWindowMs, maxDeployments: cfg.maxDeployments, repeatedFailureThreshold: cfg.repeatedFailureThreshold, stuckDeploymentThresholdMs: cfg.stuckDeploymentThresholdMs, maxAttempts: cfg.maxAttempts })) if (!Number.isFinite(value) || value <= 0) throw new VercelObserverError(`Invalid Vercel observer numeric configuration: ${name}.`, 'invalid_config')
  if (!cfg.clock?.now || !cfg.sleeper?.sleep) throw new VercelObserverError('Vercel observer requires injected clock and sleeper.', 'invalid_config')
}

export class VercelObserver implements Observer {
  private readonly deps: VercelObservationDeps
  constructor(deps: VercelObservationDeps) {
    this.deps = deps
  }
  async observe(_context: ProviderObservationContext): Promise<SupervisorIncident[]> {
    const { config: cfg, client } = this.deps
    validateConfig(cfg)
    let token = ''
    try { token = await this.deps.secretResolver(cfg.providerConnectionId) } catch { return [providerErrorIncident(cfg, new VercelObserverError('Vercel token resolution failed.', 'auth'))] }
    if (!token) return [providerErrorIncident(cfg, new VercelObserverError('Vercel token is unavailable.', 'auth'))]
    try {
      const since = new Date(cfg.clock.now().getTime() - cfg.lookbackWindowMs)
      const page = await this.withRetries(() => client.listRecentDeployments({ projectId: cfg.projectId, teamId: cfg.teamId, environment: cfg.environment, limit: cfg.maxDeployments, since, token }))
      const deployments = page.deployments.slice(0, cfg.maxDeployments)
      const incidents = this.detect(deployments)
      return incidents.map(i => incidentSchema.parse(i))
    } catch (error) {
      return [providerErrorIncident(cfg, error)]
    }
  }
  private async withRetries<T>(fn: () => Promise<T>): Promise<T> {
    const cfg = this.deps.config
    let last: unknown
    for (let attempt = 1; attempt <= cfg.maxAttempts; attempt += 1) {
      try { return await fn() } catch (error) {
        if (isAuthError(error)) throw error
        last = error
        if (!isRetryableProviderError(error) || attempt >= cfg.maxAttempts) throw error
        const retryAfter = error instanceof VercelObserverError ? error.retryAfterMs : undefined
        await cfg.sleeper.sleep(retryAfter ?? Math.min(30_000, 250 * (2 ** (attempt - 1))))
      }
    }
    throw last
  }
  private detect(deployments: VercelDeployment[]): SupervisorIncident[] {
    const cfg = this.deps.config; const incidents: SupervisorIncident[] = []; if (deployments.length === 0) return incidents
    const classified = deployments.map(d => ({ d, state: normalizeDeploymentState(d.state) }))
    const consecutiveFailures = classified.slice(0, cfg.repeatedFailureThreshold).filter(c => c.state === 'failed')
    const repeated = consecutiveFailures.length >= cfg.repeatedFailureThreshold
    if (repeated) incidents.push(repeatedFailureIncident(cfg, consecutiveFailures.map(c => c.d), consecutiveFailures.map(c => c.state)))
    const latest = classified[0]
    if (latest.state === 'failed' && !repeated) incidents.push(failedDeploymentIncident(cfg, latest.d))
    if (latest.state === 'canceled' && cfg.environment === 'production') incidents.push(canceledProductionIncident(cfg, latest.d))
    if (latest.state === 'unknown') incidents.push(unknownStateIncident(cfg, latest.d))
    if (isStuck(latest.d, cfg.clock.now().getTime(), cfg.stuckDeploymentThresholdMs)) incidents.push(stuckDeploymentIncident(cfg, latest.d))
    return incidents
  }
}
