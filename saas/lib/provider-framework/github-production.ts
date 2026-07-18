import { createHash } from 'node:crypto'
import type { CoordinationStore, WorkItem } from '../supervisor/coordination/index.ts'
import { ownershipIdentity } from '../supervisor/coordination/index.ts'
import { createUniversalProviderRegistry } from './bootstrap.ts'
import { GitHubReadOnlyAdapter, type GitHubCapability, type GitHubConnection, type GitHubRuntimeConfig, type NormalizedGitHubObservation } from './github.ts'
import { createGitHubScheduleWork } from './github-scheduler.ts'
import { runGitHubObservationWork, type AuditSink, type EvidenceSink } from './github-runtime.ts'

export interface ActiveGitHubConnection extends GitHubConnection {
  readonly owner: string
  readonly repository: string
  readonly apiBaseUrl?: string
}

const safe = (value: unknown, max = 240) => String(value ?? '').replace(/[\r\n\t]/g, ' ').slice(0, max)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')

export async function loadActiveGitHubConnections(db: any, limit = 10): Promise<readonly ActiveGitHubConnection[]> {
  if (process.env.GITHUB_PROVIDER_ORGANIZATION_ID && process.env.GITHUB_PROVIDER_REPOSITORY && process.env.GITHUB_PROVIDER_CREDENTIAL_REF) {
    const [owner, repository] = process.env.GITHUB_PROVIDER_REPOSITORY.split('/', 2)
    if (!owner || !repository) throw new Error('github_repository_must_be_owner_slash_repo')
    return [{
      organizationId: process.env.GITHUB_PROVIDER_ORGANIZATION_ID,
      providerId: 'github',
      credential: { kind: 'secret_ref', ref: process.env.GITHUB_PROVIDER_CREDENTIAL_REF },
      status: 'valid', configurationVersion: 1, disabled: false, revoked: false,
      scopes: ['metadata:read'], owner, repository,
      apiBaseUrl: process.env.GITHUB_PROVIDER_API_BASE_URL,
    }]
  }
  const { data, error } = await db.from('provider_connections')
    .select('tenant_id,id,credential_ref,status,configuration_version,is_active,is_revoked,scopes,configuration')
    .eq('provider', 'github').eq('is_active', true).limit(Math.min(Math.max(limit, 1), 25))
  if (error) throw new Error('github_connection_lookup_failed')
  return (data ?? []).flatMap((row: any) => {
    const configuration = row.configuration ?? {}
    const owner = safe(configuration.owner, 120)
    const repository = safe(configuration.repository, 120)
    if (!owner || !repository || !row.credential_ref) return []
    return [{
      organizationId: safe(row.tenant_id || row.id, 120), providerId: 'github' as const,
      credential: { kind: 'secret_ref' as const, ref: safe(row.credential_ref, 500) },
      status: row.status || 'unknown', configurationVersion: Number(row.configuration_version || 1),
      disabled: !row.is_active, revoked: !!row.is_revoked,
      scopes: Array.isArray(row.scopes) ? row.scopes.map((v: unknown) => safe(v, 120)) : [],
      owner, repository, apiBaseUrl: configuration.apiBaseUrl ? safe(configuration.apiBaseUrl, 240) : undefined,
    }]
  })
}

export function resolveGitHubCredential(ref: string): string {
  if (ref === 'env://GITHUB_PROVIDER_TOKEN') return process.env.GITHUB_PROVIDER_TOKEN || ''
  if (ref.startsWith('env://')) return process.env[ref.slice('env://'.length)] || ''
  throw new Error('github_credential_reference_not_supported')
}

export class SupabaseGitHubEvidenceSink implements EvidenceSink {
  constructor(private readonly db: any, private readonly workItemId: string) {}
  async persist(observation: NormalizedGitHubObservation): Promise<readonly string[]> {
    const rows = observation.evidenceReferences.map((evidence) => ({
      evidence_id: evidence.evidenceId,
      work_item_id: this.workItemId,
      provider: 'github',
      organization_id: observation.organizationId,
      resource_type: observation.resourceType,
      resource_id: safe(observation.resourceId, 240),
      observation_type: observation.observationType,
      severity: observation.severity,
      verification_status: observation.verificationStatus,
      summary: safe(evidence.summary, 500),
      safe_metadata: evidence.metadata,
      observed_at: observation.timestamp,
      correlation_id: observation.correlationId,
    }))
    if (!rows.length) return []
    const { error } = await this.db.from('github_provider_evidence').upsert(rows, { onConflict: 'evidence_id' })
    if (error) throw new Error(`github_evidence_persist_failed:${safe(error.message, 120)}`)
    return rows.map((row) => row.evidence_id)
  }
}

export class SupabaseGitHubAuditSink implements AuditSink {
  constructor(private readonly db: any) {}
  async persist(event: Readonly<{ eventType: string; workItemId: string; metadata: Readonly<Record<string, string | number | boolean | null>> }>): Promise<void> {
    const { error } = await this.db.from('github_provider_audit_events').insert({
      event_id: `gha_${digest(`${event.workItemId}:${event.eventType}:${JSON.stringify(event.metadata)}`).slice(0, 32)}`,
      work_item_id: event.workItemId,
      event_type: safe(event.eventType, 120),
      safe_metadata: event.metadata,
      occurred_at: new Date().toISOString(),
    })
    if (error) throw new Error(`github_audit_persist_failed:${safe(error.message, 120)}`)
  }
}

export async function enqueueGitHubObservation(input: {
  readonly coordinationStore: CoordinationStore
  readonly connection: ActiveGitHubConnection
  readonly capability: GitHubCapability
  readonly windowStart: string
  readonly queueDepth?: number
  readonly rateLimitRemaining?: number
}): Promise<{ outcome: 'created' | 'reused' | 'deferred'; workItem?: WorkItem }> {
  const work = createGitHubScheduleWork({
    organizationId: input.connection.organizationId,
    providerId: 'github',
    resourceId: input.connection.repository,
    capability: input.capability,
    windowStart: input.windowStart,
    queueDepth: input.queueDepth ?? 0,
    rateLimitRemaining: input.rateLimitRemaining ?? 1,
    disabled: input.connection.disabled,
    revoked: input.connection.revoked,
  })
  if (!work) return { outcome: 'deferred' }
  const withProject: WorkItem = { ...work, projectId: input.connection.owner }
  try {
    return { outcome: 'created', workItem: await input.coordinationStore.enqueueWorkItem(withProject) }
  } catch (error: any) {
    if (String(error?.code || error?.message).includes('conflict')) return { outcome: 'reused', workItem: await input.coordinationStore.getWorkItem(withProject.workItemId) }
    throw error
  }
}

export async function runAcceptedGitHubObservation(input: {
  readonly db: any
  readonly coordinationStore: CoordinationStore
  readonly connection: ActiveGitHubConnection
  readonly workItem: WorkItem
  readonly capability: GitHubCapability
  readonly ownerInstanceId: string
  readonly ownerRuntimeId: string
  readonly leaseMs: number
  readonly adapter?: GitHubReadOnlyAdapter
}): Promise<readonly NormalizedGitHubObservation[]> {
  const now = new Date()
  await input.coordinationStore.registerInstance({
    instanceId: input.ownerInstanceId, runtimeId: input.ownerRuntimeId,
    startedAt: now.toISOString(), heartbeatAt: now.toISOString(),
    softwareVersion: process.env.VERCEL_GIT_COMMIT_SHA || 'local', schemaVersion: 'supervisor-instance-v1',
    supportedProviderKinds: ['github'], status: 'healthy',
  })
  const lease = await input.coordinationStore.acquireLease({
    workItemId: input.workItem.workItemId, ownerInstanceId: input.ownerInstanceId,
    ownerRuntimeId: input.ownerRuntimeId, leaseDurationMs: input.leaseMs, now,
  })
  const token = resolveGitHubCredential(input.connection.credential.ref)
  if (!token) throw new Error('github_credential_unavailable')
  const config: GitHubRuntimeConfig = {
    organizationId: input.connection.organizationId,
    token,
    apiBaseUrl: input.connection.apiBaseUrl,
  }
  return runGitHubObservationWork({
    store: input.coordinationStore,
    registry: createUniversalProviderRegistry(),
    adapter: input.adapter ?? new GitHubReadOnlyAdapter(),
    workItem: { ...input.workItem, state: 'leased' },
    owner: ownershipIdentity(lease),
    config,
    capability: input.capability,
    evidence: new SupabaseGitHubEvidenceSink(input.db, input.workItem.workItemId),
    audit: new SupabaseGitHubAuditSink(input.db),
  })
}
