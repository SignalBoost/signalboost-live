import { isIP } from 'node:net'
import {
  appendSecurityEvidence,
  type SecurityEvidenceChainEntry,
  type SecurityEvidenceObservation,
} from './evidence.ts'
import {
  type SignedSecurityEngagement,
  type TrustedSecurityEngagementKeys,
} from './engagement.ts'
import {
  authorizeSecurityAction,
  type SecurityHostState,
  type SecurityRefereeDecision,
} from './referee.ts'

export const REPOSITORY_PATROL_EVENT_SCHEMA = 'itmounts-repository-patrol-event-v1' as const

export type RepositoryPatrolSource =
  | 'github-audit-log'
  | 'github-webhook'
  | 'scm-audit-log'
  | 'ci-provider'

export type RepositoryPatrolEventType =
  | 'repository.access'
  | 'repository.clone'
  | 'repository.download'
  | 'repository.push'
  | 'repository.force_push'
  | 'repository.workflow_change'
  | 'repository.permission_change'
  | 'repository.branch_protection_change'
  | 'repository.release'
  | 'repository.artifact_download'
  | 'repository.dependency_change'

export interface RepositoryPatrolEvent {
  schema: typeof REPOSITORY_PATROL_EVENT_SCHEMA
  eventId: string
  repository: string
  eventType: RepositoryPatrolEventType
  occurredAt: string
  source: RepositoryPatrolSource
  actorId?: string
  sourceIp?: string
  countryEstimate?: string
  asn?: string
  userAgent?: string
  ref?: string
  commitSha?: string
  changedPaths?: readonly string[]
}

export interface RepositoryPatrolIndicator {
  code: string
  description: string
}

export type RepositoryPatrolIngestionResult = Readonly<{
  accepted: boolean
  reason: string
  decision: Readonly<SecurityRefereeDecision>
  indicators: readonly Readonly<RepositoryPatrolIndicator>[]
  evidenceChain: readonly SecurityEvidenceChainEntry[]
}>

const SOURCES: readonly RepositoryPatrolSource[] = Object.freeze([
  'github-audit-log',
  'github-webhook',
  'scm-audit-log',
  'ci-provider',
])

const EVENT_TYPES: readonly RepositoryPatrolEventType[] = Object.freeze([
  'repository.access',
  'repository.clone',
  'repository.download',
  'repository.push',
  'repository.force_push',
  'repository.workflow_change',
  'repository.permission_change',
  'repository.branch_protection_change',
  'repository.release',
  'repository.artifact_download',
  'repository.dependency_change',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength
}

function validTime(value: unknown): value is string {
  return validText(value, 128) && Number.isFinite(Date.parse(value))
}

export function normalizeRepositoryPatrolName(value: string): string {
  return String(value || '').trim().toLowerCase()
}

export function isValidRepositoryPatrolName(value: unknown): value is string {
  if (!validText(value, 256)) return false
  const normalized = value.trim()
  if (normalized.startsWith('/') || normalized.endsWith('/') || normalized.includes('//')) return false
  const parts = normalized.split('/')
  if (parts.length !== 2) return false
  return parts.every(part => /^[A-Za-z0-9_.-]{1,100}$/.test(part) && part !== '.' && part !== '..')
}

function validOptionalText(value: unknown, maximumLength: number): boolean {
  return value === undefined || validText(value, maximumLength)
}

function validChangedPath(value: unknown): value is string {
  return validText(value, 512)
    && !value.startsWith('/')
    && !value.includes('\u0000')
    && !value.split('/').includes('..')
}

export function validateRepositoryPatrolEvent(value: unknown): readonly string[] {
  const issues: string[] = []
  if (!isRecord(value)) return Object.freeze(['event:invalid'])
  if (value.schema !== REPOSITORY_PATROL_EVENT_SCHEMA) issues.push('schema:unsupported')
  if (!validText(value.eventId, 256)) issues.push('eventId:invalid')
  if (!isValidRepositoryPatrolName(value.repository)) issues.push('repository:invalid')
  if (!EVENT_TYPES.includes(value.eventType as RepositoryPatrolEventType)) issues.push('eventType:unsupported')
  if (!validTime(value.occurredAt)) issues.push('occurredAt:invalid')
  if (!SOURCES.includes(value.source as RepositoryPatrolSource)) issues.push('source:unsupported')
  if (!validOptionalText(value.actorId, 256)) issues.push('actorId:invalid')
  if (value.sourceIp !== undefined && (typeof value.sourceIp !== 'string' || isIP(value.sourceIp.trim()) === 0)) issues.push('sourceIp:invalid')
  if (!validOptionalText(value.countryEstimate, 128)) issues.push('countryEstimate:invalid')
  if (!validOptionalText(value.asn, 128)) issues.push('asn:invalid')
  if (!validOptionalText(value.userAgent, 1024)) issues.push('userAgent:invalid')
  if (!validOptionalText(value.ref, 512)) issues.push('ref:invalid')
  if (value.commitSha !== undefined && (!validText(value.commitSha, 64) || !/^[a-fA-F0-9]{7,64}$/.test(value.commitSha))) issues.push('commitSha:invalid')
  if (value.changedPaths !== undefined) {
    if (!Array.isArray(value.changedPaths) || value.changedPaths.length > 100 || value.changedPaths.some(path => !validChangedPath(path))) {
      issues.push('changedPaths:invalid')
    } else if (new Set(value.changedPaths).size !== value.changedPaths.length) {
      issues.push('changedPaths:duplicates_not_permitted')
    }
  }
  return Object.freeze(issues)
}

export function classifyRepositoryPatrolIndicators(event: RepositoryPatrolEvent): readonly Readonly<RepositoryPatrolIndicator>[] {
  const indicators: RepositoryPatrolIndicator[] = []
  const add = (code: string, description: string) => indicators.push(Object.freeze({ code, description }))

  if (event.eventType === 'repository.force_push') add('history_rewrite_observed', 'Repository history rewrite was reported by authorized telemetry.')
  if (event.eventType === 'repository.workflow_change') add('workflow_control_change_observed', 'CI/CD workflow control change was reported by authorized telemetry.')
  if (event.eventType === 'repository.permission_change') add('permission_boundary_change_observed', 'Repository permission boundary change was reported by authorized telemetry.')
  if (event.eventType === 'repository.branch_protection_change') add('branch_protection_change_observed', 'Branch-protection change was reported by authorized telemetry.')
  if (event.eventType === 'repository.dependency_change') add('dependency_surface_change_observed', 'Dependency surface change was reported by authorized telemetry.')
  if (event.eventType === 'repository.artifact_download') add('artifact_access_observed', 'Build or release artifact access was reported by authorized telemetry.')
  if (event.eventType === 'repository.clone') add('repository_clone_observed', 'Repository clone activity was reported by authorized telemetry.')
  if (event.eventType === 'repository.download') add('repository_download_observed', 'Repository download activity was reported by authorized telemetry.')

  for (const path of event.changedPaths ?? []) {
    const normalized = path.toLowerCase()
    if (normalized.startsWith('.github/workflows/')) add('workflow_path_changed', `Workflow path changed: ${path}`)
    if (/^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(normalized)) add('dependency_lock_changed', `Dependency lockfile changed: ${path}`)
    if (/(^|\/)(dockerfile|compose\.ya?ml|vercel\.json|.*\.tf|.*\.tfvars)$/.test(normalized)) add('deployment_or_iac_path_changed', `Deployment/IaC path changed: ${path}`)
  }

  const unique = new Map(indicators.map(item => [`${item.code}:${item.description}`, item]))
  return Object.freeze([...unique.values()])
}

function pushObservation(
  observations: SecurityEvidenceObservation[],
  id: string,
  kind: string,
  source: RepositoryPatrolSource,
  collectedAt: string,
  value: string,
): void {
  observations.push(Object.freeze({ id, kind, source, collectedAt, value }))
}

function repositoryPatrolObservations(
  event: RepositoryPatrolEvent,
  indicators: readonly RepositoryPatrolIndicator[],
): readonly SecurityEvidenceObservation[] {
  const observations: SecurityEvidenceObservation[] = []
  pushObservation(observations, 'repository', 'repository', event.source, event.occurredAt, normalizeRepositoryPatrolName(event.repository))
  pushObservation(observations, 'event-type', 'repository_event_type', event.source, event.occurredAt, event.eventType)
  if (event.actorId) pushObservation(observations, 'actor-id', 'authenticated_actor', event.source, event.occurredAt, event.actorId)
  if (event.sourceIp) pushObservation(observations, 'source-ip', 'source_ip', event.source, event.occurredAt, event.sourceIp)
  if (event.countryEstimate) pushObservation(observations, 'country-estimate', 'country_estimate', event.source, event.occurredAt, event.countryEstimate)
  if (event.asn) pushObservation(observations, 'asn', 'asn_or_provider', event.source, event.occurredAt, event.asn)
  if (event.userAgent) pushObservation(observations, 'user-agent', 'user_agent', event.source, event.occurredAt, event.userAgent)
  if (event.ref) pushObservation(observations, 'ref', 'repository_ref', event.source, event.occurredAt, event.ref)
  if (event.commitSha) pushObservation(observations, 'commit-sha', 'commit_sha', event.source, event.occurredAt, event.commitSha.toLowerCase())
  for (const [index, path] of (event.changedPaths ?? []).entries()) {
    pushObservation(observations, `changed-path-${index + 1}`, 'changed_path', event.source, event.occurredAt, path)
  }
  for (const [index, indicator] of indicators.entries()) {
    pushObservation(observations, `indicator-${index + 1}`, 'defensive_indicator', event.source, event.occurredAt, `${indicator.code}: ${indicator.description}`)
  }
  return Object.freeze(observations)
}

function rejectedResult(
  chain: readonly SecurityEvidenceChainEntry[],
  reason: string,
  decision?: Readonly<SecurityRefereeDecision>,
): RepositoryPatrolIngestionResult {
  return Object.freeze({
    accepted: false,
    reason,
    decision: decision ?? Object.freeze({ allowed: false, reason, engagementId: '', action: 'observe.telemetry', target: '' }),
    indicators: Object.freeze([]),
    evidenceChain: chain,
  })
}

export function ingestRepositoryPatrolEvent(params: {
  envelope: SignedSecurityEngagement | unknown
  trustedKeys: TrustedSecurityEngagementKeys
  hostState: SecurityHostState
  event: RepositoryPatrolEvent | unknown
  evidenceChain: readonly SecurityEvidenceChainEntry[]
}): RepositoryPatrolIngestionResult {
  const issues = validateRepositoryPatrolEvent(params.event)
  if (issues.length) return rejectedResult(params.evidenceChain, `repository_event_invalid:${issues.join(',')}`)

  const event = params.event as RepositoryPatrolEvent
  const target = { kind: 'repository' as const, value: normalizeRepositoryPatrolName(event.repository) }
  const engagementRecord = isRecord(params.envelope) && isRecord(params.envelope.manifest) ? params.envelope.manifest : null
  const engagementId = engagementRecord && typeof engagementRecord.engagementId === 'string' ? engagementRecord.engagementId : ''
  const decision = authorizeSecurityAction({
    envelope: params.envelope,
    trustedKeys: params.trustedKeys,
    request: {
      engagementId,
      role: 'guardian',
      action: 'observe.telemetry',
      target,
    },
    hostState: params.hostState,
  })
  if (!decision.allowed) return rejectedResult(params.evidenceChain, decision.reason, decision)

  const indicators = classifyRepositoryPatrolIndicators(event)
  const evidenceChain = appendSecurityEvidence(params.evidenceChain, {
    eventId: event.eventId,
    engagementId,
    recordedAt: params.hostState.now,
    actorRole: 'guardian',
    action: 'observe.telemetry',
    decision: 'observed',
    target,
    observations: repositoryPatrolObservations(event, indicators),
    attributionHypotheses: [],
  })

  return Object.freeze({
    accepted: true,
    reason: 'observed',
    decision,
    indicators,
    evidenceChain,
  })
}
