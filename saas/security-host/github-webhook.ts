import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  REPOSITORY_PATROL_EVENT_SCHEMA,
  type RepositoryPatrolEvent,
  type RepositoryPatrolSourceProvenance,
} from './repository-patrol.ts'

const MAX_GITHUB_WEBHOOK_BODY_BYTES = 5 * 1024 * 1024
const GITHUB_SIGNATURE_PREFIX = 'sha256='

export interface GitHubWebhookDeliveryHeaders {
  signature256: string
  deliveryId: string
  eventName: string
  userAgent: string
  hookId?: string
  installationTargetType?: string
  installationTargetId?: string
}

export type GitHubWebhookVerification =
  | Readonly<{ valid: true; provenance: Readonly<RepositoryPatrolSourceProvenance> }>
  | Readonly<{ valid: false; reason: string }>

export type GitHubRepositoryWebhookNormalization =
  | Readonly<{ accepted: true; event: Readonly<RepositoryPatrolEvent>; provenance: Readonly<RepositoryPatrolSourceProvenance> }>
  | Readonly<{ accepted: false; reason: string }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength
}

function validDeliveryId(value: unknown): value is string {
  return validText(value, 128) && /^[A-Za-z0-9-]+$/.test(value)
}

function validEventName(value: unknown): value is string {
  return validText(value, 128) && /^[a-z0-9_]+$/.test(value)
}

function validOptionalHeader(value: unknown, maximumLength: number): boolean {
  return value === undefined || validText(value, maximumLength)
}

function verifySignature(rawBody: string, secret: string, signatureHeader: string): boolean {
  if (!validText(secret, 4096) || secret.length < 16) return false
  if (typeof signatureHeader !== 'string' || !signatureHeader.startsWith(GITHUB_SIGNATURE_PREFIX)) return false
  const suppliedHex = signatureHeader.slice(GITHUB_SIGNATURE_PREFIX.length)
  if (!/^[a-fA-F0-9]{64}$/.test(suppliedHex)) return false

  const expected = createHmac('sha256', secret).update(Buffer.from(rawBody, 'utf8')).digest()
  const supplied = Buffer.from(suppliedHex, 'hex')
  return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected)
}

export function verifyGitHubWebhookDelivery(params: {
  rawBody: string
  secret: string
  headers: GitHubWebhookDeliveryHeaders
}): GitHubWebhookVerification {
  if (typeof params.rawBody !== 'string' || Buffer.byteLength(params.rawBody, 'utf8') > MAX_GITHUB_WEBHOOK_BODY_BYTES) {
    return Object.freeze({ valid: false, reason: 'github_webhook_body_invalid_or_too_large' })
  }
  if (!isRecord(params.headers)) return Object.freeze({ valid: false, reason: 'github_webhook_headers_invalid' })
  if (!validDeliveryId(params.headers.deliveryId)) return Object.freeze({ valid: false, reason: 'github_delivery_id_invalid' })
  if (!validEventName(params.headers.eventName)) return Object.freeze({ valid: false, reason: 'github_event_name_invalid' })
  if (!validText(params.headers.userAgent, 256) || !params.headers.userAgent.startsWith('GitHub-Hookshot/')) {
    return Object.freeze({ valid: false, reason: 'github_user_agent_invalid' })
  }
  if (!validOptionalHeader(params.headers.hookId, 64)) return Object.freeze({ valid: false, reason: 'github_hook_id_invalid' })
  if (params.headers.hookId !== undefined && !/^\d+$/.test(params.headers.hookId)) return Object.freeze({ valid: false, reason: 'github_hook_id_invalid' })
  if (!validOptionalHeader(params.headers.installationTargetType, 128)) return Object.freeze({ valid: false, reason: 'github_installation_target_type_invalid' })
  if (!validOptionalHeader(params.headers.installationTargetId, 128)) return Object.freeze({ valid: false, reason: 'github_installation_target_id_invalid' })
  if (!verifySignature(params.rawBody, params.secret, params.headers.signature256)) {
    return Object.freeze({ valid: false, reason: 'github_signature_invalid' })
  }

  return Object.freeze({
    valid: true,
    provenance: Object.freeze({
      deliveryId: params.headers.deliveryId,
      eventName: params.headers.eventName,
      payloadSha256: createHash('sha256').update(Buffer.from(params.rawBody, 'utf8')).digest('hex'),
      hookId: params.headers.hookId,
      hookUserAgent: params.headers.userAgent,
      installationTargetType: params.headers.installationTargetType,
      installationTargetId: params.headers.installationTargetId,
    }),
  })
}

function uniqueChangedPaths(payload: Record<string, unknown>): readonly string[] {
  const commits = Array.isArray(payload.commits) ? payload.commits : []
  const paths: string[] = []
  for (const commit of commits) {
    if (!isRecord(commit)) continue
    for (const field of ['added', 'modified', 'removed'] as const) {
      if (!Array.isArray(commit[field])) continue
      for (const value of commit[field]) {
        if (typeof value !== 'string' || value.length === 0 || value.length > 512) continue
        if (value.startsWith('/') || value.split('/').includes('..')) continue
        paths.push(value)
      }
    }
  }
  const sensitive = (path: string) =>
    /^\.github\/(?:workflows\/|CODEOWNERS$|main-write-token$)/.test(path)
    || /(^|\/)security-host\//.test(path)
    || /(^|\/)supabase\/migrations\//.test(path)
    || /(^|\/)app\/api\/webhook\/github\/route\.ts$/.test(path)
    || /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)
  const unique = [...new Set(paths)]
  return Object.freeze([
    ...unique.filter(sensitive),
    ...unique.filter(path => !sensitive(path)),
  ].slice(0, 100))
}

function repositoryName(payload: Record<string, unknown>): string {
  return isRecord(payload.repository) && typeof payload.repository.full_name === 'string'
    ? payload.repository.full_name
    : ''
}

function reportedSender(payload: Record<string, unknown>): string | undefined {
  if (!isRecord(payload.sender) || typeof payload.sender.login !== 'string' || payload.sender.login.trim().length === 0) return undefined
  return payload.sender.login.slice(0, 256)
}

function optionalString(value: unknown, maximumLength: number): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.slice(0, maximumLength) : undefined
}

function normalizeSupportedGitHubEvent(params: {
  eventName: string
  payload: Record<string, unknown>
  receivedAt: string
  provenance: RepositoryPatrolSourceProvenance
}): RepositoryPatrolEvent | null {
  const repository = repositoryName(params.payload)
  const common = {
    schema: REPOSITORY_PATROL_EVENT_SCHEMA,
    eventId: `github:${params.provenance.deliveryId}`,
    repository,
    occurredAt: params.receivedAt,
    source: 'github-webhook' as const,
    actorId: reportedSender(params.payload),
    sourceProvenance: params.provenance,
  }

  if (params.eventName === 'push') {
    return {
      ...common,
      eventType: params.payload.forced === true ? 'repository.force_push' : 'repository.push',
      ref: optionalString(params.payload.ref, 512),
      commitSha: optionalString(params.payload.after, 64),
      changedPaths: uniqueChangedPaths(params.payload),
    }
  }

  if (params.eventName === 'branch_protection_rule') {
    return {
      ...common,
      eventType: 'repository.branch_protection_change',
      ref: isRecord(params.payload.rule) ? optionalString(params.payload.rule.name, 512) : undefined,
    }
  }

  if (params.eventName === 'release') {
    return {
      ...common,
      eventType: 'repository.release',
      ref: isRecord(params.payload.release) ? optionalString(params.payload.release.tag_name, 512) : undefined,
    }
  }

  return null
}

export function normalizeAuthenticatedGitHubRepositoryWebhook(params: {
  rawBody: string
  secret: string
  headers: GitHubWebhookDeliveryHeaders
  receivedAt: string
}): GitHubRepositoryWebhookNormalization {
  const verified = verifyGitHubWebhookDelivery(params)
  if (verified.valid === false) return Object.freeze({ accepted: false, reason: verified.reason })
  if (!Number.isFinite(Date.parse(params.receivedAt))) return Object.freeze({ accepted: false, reason: 'github_received_at_invalid' })

  let payload: unknown
  try {
    payload = JSON.parse(params.rawBody)
  } catch {
    return Object.freeze({ accepted: false, reason: 'github_payload_invalid_json' })
  }
  if (!isRecord(payload)) return Object.freeze({ accepted: false, reason: 'github_payload_invalid' })

  const event = normalizeSupportedGitHubEvent({
    eventName: params.headers.eventName,
    payload,
    receivedAt: params.receivedAt,
    provenance: verified.provenance,
  })
  if (!event) return Object.freeze({ accepted: false, reason: 'github_event_not_supported_for_repository_patrol' })
  if (!event.repository) return Object.freeze({ accepted: false, reason: 'github_repository_missing' })

  return Object.freeze({ accepted: true, event: Object.freeze(event), provenance: verified.provenance })
}
