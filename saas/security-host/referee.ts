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

function deny(request: SecurityActionRequest, reason: string): Readonly<SecurityRefereeDecision> {
  return Object.freeze({
    allowed: false,
    reason,
    engagementId: String(request?.engagementId || ''),
    action: String(request?.action || ''),
    target: String(request?.target?.value || ''),
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

function ipv4ToInteger(value: string): number | null {
  if (isIP(value) !== 4) return null
  const parts = value.split('.').map(Number)
  return ((((parts[0] * 256) + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0
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

export function securityTargetIsInScope(request: SecurityTarget, scopes: readonly SecurityTarget[]): boolean {
  if (!request || typeof request.value !== 'string') return false
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

export function authorizeSecurityAction(params: {
  envelope: SignedSecurityEngagement | unknown
  trustedKeys: TrustedSecurityEngagementKeys
  request: SecurityActionRequest
  hostState: SecurityHostState
}): Readonly<SecurityRefereeDecision> {
  const request = params.request
  const verified = verifySignedSecurityEngagement(params.envelope, params.trustedKeys)
  if (!verified.valid) return deny(request, verified.reason)
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
