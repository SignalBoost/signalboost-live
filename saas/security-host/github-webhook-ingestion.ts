import {
  normalizeAuthenticatedGitHubRepositoryWebhook,
  type GitHubWebhookDeliveryHeaders,
} from './github-webhook.ts'
import { ingestRepositoryPatrolEvent } from './repository-patrol.ts'
import {
  verifySecurityEvidenceChain,
  type SecurityEvidenceChainEntry,
} from './evidence.ts'
import type { SignedSecurityEngagement, TrustedSecurityEngagementKeys } from './engagement.ts'

export interface RepositoryWebhookDurableState {
  evidenceChain: readonly SecurityEvidenceChainEntry[]
  requestsInCurrentMinute: number
  distinctTargetsTouched: number
  targetAlreadyCounted: boolean
}

export type RepositoryWebhookAppendResult = 'appended' | 'duplicate' | 'chain_conflict'

export interface RepositoryWebhookEvidenceStore {
  loadState(params: { engagementId: string; repository: string; now: string }): Promise<RepositoryWebhookDurableState>
  append(params: {
    deliveryId: string
    repository: string
    providerEvent: string
    payloadSha256: string
    engagementId: string
    entry: SecurityEvidenceChainEntry
    indicators: readonly Readonly<{ code: string; description: string }>[]
  }): Promise<RepositoryWebhookAppendResult>
}

export interface GitHubRepositoryWebhookRuntimeConfig {
  secret: string
  engagement: SignedSecurityEngagement | unknown
  trustedKeys: TrustedSecurityEngagementKeys
  killSwitchActive: boolean
}

export type GitHubRepositoryWebhookRuntimeResult = Readonly<{
  status: number
  ok: boolean
  outcome: string
  eventId?: string
  repository?: string
  evidenceHash?: string
  indicators?: readonly string[]
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function engagementId(envelope: unknown): string {
  if (!isRecord(envelope) || !isRecord(envelope.manifest)) return ''
  return typeof envelope.manifest.engagementId === 'string' ? envelope.manifest.engagementId : ''
}

function rejected(status: number, outcome: string): GitHubRepositoryWebhookRuntimeResult {
  return Object.freeze({ status, ok: false, outcome })
}

function denialStatus(reason: string): number {
  if (reason === 'request_rate_limit_reached') return 429
  if (reason === 'repository_event_replayed') return 200
  return 403
}

export async function ingestAuthenticatedGitHubRepositoryWebhook(params: {
  rawBody: string
  headers: GitHubWebhookDeliveryHeaders
  receivedAt: string
  config: GitHubRepositoryWebhookRuntimeConfig
  store: RepositoryWebhookEvidenceStore
}): Promise<GitHubRepositoryWebhookRuntimeResult> {
  const normalized = normalizeAuthenticatedGitHubRepositoryWebhook({
    rawBody: params.rawBody,
    secret: params.config.secret,
    headers: params.headers,
    receivedAt: params.receivedAt,
  })
  if (normalized.accepted === false) {
    const authenticationFailure = normalized.reason.includes('signature') || normalized.reason.includes('headers')
    return rejected(authenticationFailure ? 401 : 400, normalized.reason)
  }

  const id = engagementId(params.config.engagement)
  if (!id) return rejected(503, 'security_engagement_not_configured')

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let state: RepositoryWebhookDurableState
    try {
      state = await params.store.loadState({ engagementId: id, repository: normalized.event.repository, now: params.receivedAt })
    } catch {
      return rejected(503, 'security_evidence_store_unavailable')
    }
    if (!verifySecurityEvidenceChain(state.evidenceChain)) return rejected(503, 'evidence_chain_invalid')

    const result = ingestRepositoryPatrolEvent({
      envelope: params.config.engagement,
      trustedKeys: params.config.trustedKeys,
      hostState: {
        now: params.receivedAt,
        killSwitchActive: params.config.killSwitchActive,
        requestsInCurrentMinute: state.requestsInCurrentMinute,
        concurrentActions: 0,
        distinctTargetsTouched: state.distinctTargetsTouched,
        targetAlreadyCounted: state.targetAlreadyCounted,
      },
      event: normalized.event,
      evidenceChain: state.evidenceChain,
    })
    if (!result.accepted) return rejected(denialStatus(result.reason), result.reason)

    const entry = result.evidenceChain[result.evidenceChain.length - 1]
    let appended: RepositoryWebhookAppendResult
    try {
      appended = await params.store.append({
        deliveryId: normalized.provenance.deliveryId,
        repository: normalized.event.repository.toLowerCase(),
        providerEvent: normalized.provenance.eventName,
        payloadSha256: normalized.provenance.payloadSha256,
        engagementId: id,
        entry,
        indicators: result.indicators,
      })
    } catch {
      return rejected(503, 'security_evidence_store_unavailable')
    }
    if (appended === 'duplicate') {
      return Object.freeze({ status: 200, ok: true, outcome: 'duplicate_delivery', eventId: normalized.event.eventId })
    }
    if (appended === 'chain_conflict') continue
    return Object.freeze({
      status: 202,
      ok: true,
      outcome: 'evidence_appended',
      eventId: normalized.event.eventId,
      repository: normalized.event.repository.toLowerCase(),
      evidenceHash: entry.hash,
      indicators: Object.freeze(result.indicators.map(item => item.code)),
    })
  }
  return rejected(503, 'evidence_chain_concurrency_conflict')
}
