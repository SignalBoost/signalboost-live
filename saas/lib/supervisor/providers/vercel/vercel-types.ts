import type { SupervisorIncident } from '../../incident-schema.ts'
import type { ProviderObservationContext } from '../../execution-contracts.ts'

export type VercelEnvironment = 'sandbox' | 'preview' | 'production'
export type NormalizedDeploymentState = 'queued' | 'building' | 'ready' | 'failed' | 'canceled' | 'unknown'

export interface Clock { now(): Date }
export interface Sleeper { sleep(ms: number): Promise<void> }
export type SecretResolver = (connectionId: string) => Promise<string> | string

export interface VercelObserverConfig {
  providerConnectionId: string
  projectId: string
  teamId?: string
  environment: VercelEnvironment
  lookbackWindowMs: number
  maxDeployments: number
  repeatedFailureThreshold: number
  stuckDeploymentThresholdMs: number
  maxAttempts: number
  /**
   * Language the plan and evidence text is WRITTEN in. Machine-readable fields — step ids,
   * incident types, audit event types — are unaffected, so reports and SIEM rules built on
   * them stay stable whatever a human reads.
   */
  locale?: string
  clock: Clock
  sleeper: Sleeper
}

export interface VercelProjectMetadata { id: string; name?: string; targets?: string[] }
export interface VercelDeploymentError { code?: string; message?: string }
export interface VercelDeployment {
  id: string
  projectId?: string
  state: string
  target?: string
  environment?: string
  createdAt: number | string
  ready?: number | string | null
  buildingAt?: number | string | null
  url?: string
  meta?: Record<string, unknown>
  error?: VercelDeploymentError | string | null
}
export interface VercelDeploymentsPage { deployments: VercelDeployment[] }
export interface VercelDeploymentQuery { projectId: string; teamId?: string; environment?: VercelEnvironment; limit: number; since: Date }
export interface VercelReadOnlyClient {
  getProjectMetadata(input: { projectId: string; teamId?: string; token: string }): Promise<VercelProjectMetadata>
  listRecentDeployments(input: VercelDeploymentQuery & { token: string }): Promise<VercelDeploymentsPage>
  getDeployment(input: { deploymentId: string; teamId?: string; token: string }): Promise<VercelDeployment>
  getDeploymentEvents?(input: { deploymentId: string; teamId?: string; token: string }): Promise<{ events: unknown[] }>
  listProjectEnvNames?(input: { projectId: string; teamId?: string; target: VercelEnvironment; token: string }): Promise<{ names: string[] }>
  listProductionAliases?(input: { projectId: string; teamId?: string; token: string }): Promise<{ aliases: string[] }>
}

export interface VercelObservationDeps { config: VercelObserverConfig; secretResolver: SecretResolver; client: VercelReadOnlyClient }
export interface ClassifiedDeployment { deployment: VercelDeployment; state: NormalizedDeploymentState; rawState: string; environment: VercelEnvironment }
export interface VercelObservationContext extends ProviderObservationContext { provider: 'vercel'; environment: VercelEnvironment }
export type VercelIncident = SupervisorIncident
