import { isIP } from 'node:net'
import {
  actionsForSecurityRole,
  verifySignedSecurityEngagement,
  type SecurityAction,
  type SecurityRole,
  type SecurityTarget,
  type SecurityTargetKind,
  type SignedSecurityEngagement,
  type TrustedSecurityEngagementKeys,
} from './engagement.ts'

export interface SecurityActionRequest {
  engagementId: string
  role: SecurityRole
  action: SecurityAction
  target: SecurityTarget
}

export interface SecurityHostState {
  now: string
  killSwitchActive: boolean
  requestsInCurrentMinute: number
  concurrentActions: number
  distinctTargetsTouched: number
  targetAlreadyCounted: boolean
}

export interface SecurityRefereeDecision {
  allowed: boolean
  reason: string
  engagementId: string
  action: string
  target: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deny(request: unknown, reason: string): Readonly<SecurityRefereeDecision> {
  const record = isRecord(request) ? request : {}
  const target = isRecord(record.target) ? record.target : {}
  return Object.freeze({
    allowed: false,
    reason,
    engagementId: typeof record.engagementId === 'string' ? record.engagementId : '',
    action: typeof record.action === 'string' ? record.action : '',
    target: typeof target.value === 'string' ? target.value : '',
  })
}

function allow(request: SecurityActionRequest): Readonly<SecurityRefereeDecision> {
  return Object.freeze({
    allowed: true,
    reason: 'authorized',
    engagementId: request.engagementId,
    action: request.action,
    target: request.target.value,
  })
}

function normalizeHostname(value: string): string {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '')
}

function validHostname(value: string): boolean {
  const normalized = normalizeHostname(value)
  if (!normalized || normalized.length > 253 || normalized.includes('/') || normalized.includes(':')) return false
  return normalized.split('.').every(label => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ))
}

function normalizeRepository(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function validRepository(value: string): boolean {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > 256 || normalized.startsWith('/') || normalized.endsWith('/') || normalized.includes('//')) return false
  const parts = normalized.split('/')
  if (parts.length !== 2) return false
  return parts.every(part => /^[A-Za-z0-9_.-]{1,100}$/.test(part) && part !== '.' && part !== '..')
}

function ipv4ToInteger(value: string): number | null {
  if (isIP(value) !== 4) return null
  const parts = value.split('.').map(Number)
  return ((((parts[0] * 256) + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0
}

function validIpv4Cidr(value: string): boolean {
  const match = String(value || '').trim().match(/^([^/]+)\/(\d{1,2})$/)
  if (!match || isIP(match[1]) !== 4) return false
  const prefix = Number(match[2])
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= 32
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const match = String(cidr || '').trim().match(/^([^/]+)\/(\d{1,2})$/)
  if (!match) return false
  const ipValue = ipv4ToInteger(ip)
  const networkValue = ipv4ToInteger(match[1])
  const prefix = Number(match[2])
  if (ipValue === null || networkValue === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (ipValue & mask) === (networkValue & mask)
}

function exactIpMatch(requestValue: string, scopeValue: string): boolean {
  if (isIP(requestValue) === 0 || isIP(scopeValue) === 0) return false
  // Deliberately does not resolve DNS or broaden equivalent textual IPv6 forms. A false deny is
  // safer than silently expanding scope; a future canonical IPv6 parser can narrow this gap.
  return requestValue.trim().toLowerCase() === scopeValue.trim().toLowerCase()
}

export function validSecurityActionTarget(target: SecurityTarget): boolean {
  if (!target || typeof target.value !== 'string') return false
  const value = target.value.trim()
  if (!value || value.length > 512) return false
  if (target.kind === 'host' || target.kind === 'domain') return validHostname(value)
  if (target.kind === 'ip') return isIP(value) !== 0
  if (target.kind === 'cidr') return validIpv4Cidr(value)
  if (target.kind === 'repository') return validRepository(value)
  return false
}

export function securityTargetIsInScope(request: SecurityTarget, scopes: readonly SecurityTarget[]): boolean {
  if (!validSecurityActionTarget(request)) return false
  const requestKind = request.kind as SecurityTargetKind
  const requestValue = request.value.trim()

  return scopes.some(scope => {
    if (!scope || typeof scope.value !== 'string') return false
    const scopeValue = scope.value.trim()

    if (scope.kind === 'domain' && (requestKind === 'domain' || requestKind === 'host')) {
      const requestedHost = normalizeHostname(requestValue)
      const allowedDomain = normalizeHostname(scopeValue)
      return requestedHost === allowedDomain || requestedHost.endsWith(`.${allowedDomain}`)
    }
    if (scope.kind === 'host' && requestKind === 'host') {
      return normalizeHostname(requestValue) === normalizeHostname(scopeValue)
    }
    if (scope.kind === 'ip' && requestKind === 'ip') return exactIpMatch(requestValue, scopeValue)
    if (scope.kind === 'cidr' && requestKind === 'ip') return ipv4InCidr(requestValue, scopeValue)
    if (scope.kind === 'repository' && requestKind === 'repository') {
      return validRepository(scopeValue) && normalizeRepository(requestValue) === normalizeRepository(scopeValue)
    }
    return false
  })
}

function validCounter(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

function validHostState(state: SecurityHostState): boolean {
  return Boolean(state)
    && typeof state.killSwitchActive === 'boolean'
    && typeof state.targetAlreadyCounted === 'boolean'
    && Number.isFinite(Date.parse(state.now))
    && validCounter(state.requestsInCurrentMinute)
    && validCounter(state.concurrentActions)
    && validCounter(state.distinctTargetsTouched)
}

const TARGET_KINDS: readonly SecurityTargetKind[] = Object.freeze(['host', 'domain', 'ip', 'cidr', 'repository'])
const KNOWN_ACTIONS: readonly SecurityAction[] = Object.freeze([
  ...actionsForSecurityRole('guardian'),
  ...actionsForSecurityRole('stranger').filter(action => !actionsForSecurityRole('guardian').includes(action)),
])

function validActionRequest(value: unknown): value is SecurityActionRequest {
  if (!isRecord(value)) return false
  if (typeof value.engagementId !== 'string' || value.engagementId.trim().length === 0 || value.engagementId.length > 256) return false
  if (value.role !== 'guardian' && value.role !== 'stranger') return false
  if (!KNOWN_ACTIONS.includes(value.action as SecurityAction)) return false
  if (!isRecord(value.target)) return false
  if (!TARGET_KINDS.includes(value.target.kind as SecurityTargetKind)) return false
  if (typeof value.target.value !== 'string' || value.target.value.trim().length === 0 || value.target.value.length > 512) return false
  return validSecurityActionTarget(value.target as unknown as SecurityTarget)
}

export function authorizeSecurityAction(params: {
  envelope: SignedSecurityEngagement | unknown
  trustedKeys: TrustedSecurityEngagementKeys
  request: SecurityActionRequest | unknown
  hostState: SecurityHostState
}): Readonly<SecurityRefereeDecision> {
  const request = params.request
  const verified = verifySignedSecurityEngagement(params.envelope, params.trustedKeys)
  if (verified.valid === false) return deny(request, verified.reason)
  if (!validActionRequest(request)) return deny(request, 'invalid_request')
  if (!validHostState(params.hostState)) return deny(request, 'invalid_host_state')

  const manifest = verified.manifest
  const now = Date.parse(params.hostState.now)
  if (params.hostState.killSwitchActive) return deny(request, 'kill_switch_active')
  if (now < Date.parse(manifest.notBefore)) return deny(request, 'engagement_not_started')
  if (now >= Date.parse(manifest.expiresAt)) return deny(request, 'engagement_expired')
  if (request.engagementId !== manifest.engagementId) return deny(request, 'engagement_mismatch')
  if (request.role !== manifest.role) return deny(request, 'role_mismatch')
  if (!manifest.allowedActions.includes(request.action)) return deny(request, 'action_not_permitted')
  if (!actionsForSecurityRole(manifest.role).includes(request.action)) return deny(request, 'action_not_permitted_for_role')
  if (request.action === 'validate.bounded' && !manifest.limits.allowActiveValidation) return deny(request, 'active_validation_not_permitted')
  if (!securityTargetIsInScope(request.target, manifest.targets)) return deny(request, 'target_out_of_scope')

  if (params.hostState.requestsInCurrentMinute >= manifest.limits.maxRequestsPerMinute) return deny(request, 'request_rate_limit_reached')
  if (params.hostState.concurrentActions >= manifest.limits.maxConcurrentActions) return deny(request, 'concurrency_limit_reached')
  if (
    !params.hostState.targetAlreadyCounted
    && params.hostState.distinctTargetsTouched >= manifest.limits.maxDistinctTargets
  ) return deny(request, 'target_limit_reached')

  return allow(request)
}
