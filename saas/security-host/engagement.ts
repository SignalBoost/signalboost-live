import { createPublicKey, verify as verifyCryptographicSignature } from 'node:crypto'
import { isIP } from 'node:net'

export const SECURITY_ENGAGEMENT_SCHEMA = 'itmounts-security-engagement-v1' as const

export type SecurityRole = 'guardian' | 'stranger'
export type SecurityPosture =
  | 'guardian-resident'
  | 'internet-stranger'
  | 'contractor'
  | 'employee'
  | 'compromised-endpoint'
  | 'privileged-insider'

export type SecurityAction =
  | 'observe.telemetry'
  | 'discover.passive'
  | 'scan.safe'
  | 'validate.bounded'
  | 'evidence.preserve'
  | 'contain.policy'
  | 'remediate.policy'
  | 'verify.defensive'
  | 'verify.retest'

export type SecurityTargetKind = 'host' | 'domain' | 'ip' | 'cidr'

export interface SecurityTarget {
  kind: SecurityTargetKind
  value: string
}

export interface SecurityEngagementLimits {
  maxRequestsPerMinute: number
  maxConcurrentActions: number
  maxDistinctTargets: number
  allowActiveValidation: boolean
}

export interface SecurityEngagementManifest {
  schema: typeof SECURITY_ENGAGEMENT_SCHEMA
  engagementId: string
  approvedBy: string
  issuedAt: string
  notBefore: string
  expiresAt: string
  role: SecurityRole
  posture: SecurityPosture
  targets: readonly SecurityTarget[]
  allowedActions: readonly SecurityAction[]
  limits: SecurityEngagementLimits
  scenarioGrantIds?: readonly string[]
  strangerDisclosures?: readonly string[]
}

export interface SecurityEngagementSignature {
  algorithm: 'Ed25519'
  keyId: string
  value: string
}

export interface SignedSecurityEngagement {
  manifest: SecurityEngagementManifest
  signature: SecurityEngagementSignature
}

export type TrustedSecurityEngagementKeys = Readonly<Record<string, string>>

export const GUARDIAN_ACTIONS: readonly SecurityAction[] = Object.freeze([
  'observe.telemetry',
  'discover.passive',
  'scan.safe',
  'evidence.preserve',
  'contain.policy',
  'remediate.policy',
  'verify.defensive',
])

export const STRANGER_ACTIONS: readonly SecurityAction[] = Object.freeze([
  'discover.passive',
  'scan.safe',
  'validate.bounded',
  'evidence.preserve',
  'verify.retest',
])

const KNOWN_ACTIONS: readonly SecurityAction[] = Object.freeze([
  ...GUARDIAN_ACTIONS,
  ...STRANGER_ACTIONS.filter(action => !GUARDIAN_ACTIONS.includes(action)),
])

const KNOWN_POSTURES: readonly SecurityPosture[] = Object.freeze([
  'guardian-resident',
  'internet-stranger',
  'contractor',
  'employee',
  'compromised-endpoint',
  'privileged-insider',
])

const TARGET_KINDS: readonly SecurityTargetKind[] = Object.freeze(['host', 'domain', 'ip', 'cidr'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown, maximumLength = 512): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximumLength
}

function validIsoTime(value: unknown): value is string {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value))
}

function isValidHostname(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\.$/, '')
  if (!normalized || normalized.length > 253 || normalized.includes('/') || normalized.includes(':')) return false
  return normalized.split('.').every(label => (
    label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ))
}

function isValidIpv4Cidr(value: string): boolean {
  const match = value.trim().match(/^([^/]+)\/(\d{1,2})$/)
  if (!match || isIP(match[1]) !== 4) return false
  const prefix = Number(match[2])
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= 32
}

function validateTarget(value: unknown, index: number, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`targets[${index}]:invalid_target`)
    return
  }
  if (!TARGET_KINDS.includes(value.kind as SecurityTargetKind)) {
    issues.push(`targets[${index}].kind:unsupported`)
    return
  }
  if (!isNonEmptyString(value.value, 512)) {
    issues.push(`targets[${index}].value:invalid`)
    return
  }

  const kind = value.kind as SecurityTargetKind
  const target = value.value.trim()
  if ((kind === 'host' || kind === 'domain') && !isValidHostname(target)) issues.push(`targets[${index}].value:invalid_hostname`)
  if (kind === 'ip' && isIP(target) === 0) issues.push(`targets[${index}].value:invalid_ip`)
  if (kind === 'cidr' && !isValidIpv4Cidr(target)) issues.push(`targets[${index}].value:unsupported_or_invalid_cidr`)
}

function validateStringList(value: unknown, field: string, issues: string[]): void {
  if (value === undefined) return
  if (!Array.isArray(value) || value.some(item => !isNonEmptyString(item, 256))) {
    issues.push(`${field}:invalid`)
    return
  }
  if (new Set(value).size !== value.length) issues.push(`${field}:duplicates_not_permitted`)
}

export function actionsForSecurityRole(role: SecurityRole): readonly SecurityAction[] {
  return role === 'guardian' ? GUARDIAN_ACTIONS : STRANGER_ACTIONS
}

export function validateSecurityEngagementManifest(value: unknown): readonly string[] {
  const issues: string[] = []
  if (!isRecord(value)) return Object.freeze(['manifest:invalid'])

  if (value.schema !== SECURITY_ENGAGEMENT_SCHEMA) issues.push('schema:unsupported')
  for (const field of ['engagementId', 'approvedBy'] as const) {
    if (!isNonEmptyString(value[field], 256)) issues.push(`${field}:invalid`)
  }
  for (const field of ['issuedAt', 'notBefore', 'expiresAt'] as const) {
    if (!validIsoTime(value[field])) issues.push(`${field}:invalid`)
  }

  if (validIsoTime(value.notBefore) && validIsoTime(value.expiresAt) && Date.parse(value.expiresAt) <= Date.parse(value.notBefore)) {
    issues.push('expiresAt:must_follow_notBefore')
  }
  if (validIsoTime(value.issuedAt) && validIsoTime(value.expiresAt) && Date.parse(value.issuedAt) >= Date.parse(value.expiresAt)) {
    issues.push('issuedAt:must_precede_expiry')
  }

  if (value.role !== 'guardian' && value.role !== 'stranger') issues.push('role:unsupported')
  if (!KNOWN_POSTURES.includes(value.posture as SecurityPosture)) issues.push('posture:unsupported')
  if (value.role === 'guardian' && value.posture !== 'guardian-resident') issues.push('posture:guardian_requires_resident')
  if (value.role === 'stranger' && value.posture === 'guardian-resident') issues.push('posture:stranger_cannot_be_resident_guardian')

  if (!Array.isArray(value.targets) || value.targets.length === 0) {
    issues.push('targets:required')
  } else {
    value.targets.forEach((target, index) => validateTarget(target, index, issues))
    const identities = value.targets
      .filter(isRecord)
      .map(target => `${String(target.kind)}:${String(target.value).trim().toLowerCase()}`)
    if (new Set(identities).size !== identities.length) issues.push('targets:duplicates_not_permitted')
  }

  if (!Array.isArray(value.allowedActions) || value.allowedActions.length === 0) {
    issues.push('allowedActions:required')
  } else {
    const roleActions = value.role === 'guardian' || value.role === 'stranger' ? actionsForSecurityRole(value.role) : []
    for (const action of value.allowedActions) {
      if (!KNOWN_ACTIONS.includes(action as SecurityAction)) issues.push(`allowedActions:${String(action)}:unsupported`)
      else if (!roleActions.includes(action as SecurityAction)) issues.push(`allowedActions:${String(action)}:not_permitted_for_role`)
    }
    if (new Set(value.allowedActions).size !== value.allowedActions.length) issues.push('allowedActions:duplicates_not_permitted')
  }

  if (!isRecord(value.limits)) {
    issues.push('limits:invalid')
  } else {
    const numericLimits = [
      ['maxRequestsPerMinute', 10_000],
      ['maxConcurrentActions', 100],
      ['maxDistinctTargets', 1_000],
    ] as const
    for (const [field, maximum] of numericLimits) {
      const current = value.limits[field]
      if (!Number.isInteger(current) || Number(current) <= 0 || Number(current) > maximum) issues.push(`limits.${field}:invalid`)
    }
    if (typeof value.limits.allowActiveValidation !== 'boolean') issues.push('limits.allowActiveValidation:invalid')
    if (
      Array.isArray(value.allowedActions)
      && value.allowedActions.includes('validate.bounded')
      && value.limits.allowActiveValidation !== true
    ) issues.push('limits.allowActiveValidation:required_for_bounded_validation')
    if (
      Array.isArray(value.targets)
      && Number.isInteger(value.limits.maxDistinctTargets)
      && value.targets.length > Number(value.limits.maxDistinctTargets)
    ) issues.push('limits.maxDistinctTargets:below_declared_scope')
  }

  validateStringList(value.scenarioGrantIds, 'scenarioGrantIds', issues)
  validateStringList(value.strangerDisclosures, 'strangerDisclosures', issues)
  if (value.role === 'guardian' && (value.scenarioGrantIds !== undefined || value.strangerDisclosures !== undefined)) {
    issues.push('guardian:scenario_grants_not_applicable')
  }

  return Object.freeze(issues)
}

export function canonicalSecurityJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical_json_non_finite_number')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(item => canonicalSecurityJson(item)).join(',')}]`
  if (isRecord(value)) {
    const keys = Object.keys(value).sort()
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalSecurityJson(value[key])}`).join(',')}}`
  }
  throw new Error('canonical_json_unsupported_value')
}

export function serializeSecurityEngagementManifest(manifest: SecurityEngagementManifest): string {
  return canonicalSecurityJson(manifest)
}

export type EngagementVerification =
  | Readonly<{ valid: true; manifest: SecurityEngagementManifest }>
  | Readonly<{ valid: false; reason: string; issues: readonly string[] }>

export function verifySignedSecurityEngagement(
  envelope: unknown,
  trustedKeys: TrustedSecurityEngagementKeys,
): EngagementVerification {
  if (!isRecord(envelope) || !isRecord(envelope.manifest) || !isRecord(envelope.signature)) {
    return Object.freeze({ valid: false, reason: 'invalid_envelope', issues: Object.freeze(['envelope:invalid']) })
  }

  const manifestIssues = validateSecurityEngagementManifest(envelope.manifest)
  if (manifestIssues.length) return Object.freeze({ valid: false, reason: 'manifest_invalid', issues: manifestIssues })

  const signature = envelope.signature
  if (signature.algorithm !== 'Ed25519' || !isNonEmptyString(signature.keyId, 256) || !isNonEmptyString(signature.value, 256)) {
    return Object.freeze({ valid: false, reason: 'signature_invalid', issues: Object.freeze(['signature:invalid']) })
  }
  const publicKey = trustedKeys[signature.keyId]
  if (!publicKey) return Object.freeze({ valid: false, reason: 'unknown_signing_key', issues: Object.freeze(['signature.keyId:untrusted']) })
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature.value)) {
    return Object.freeze({ valid: false, reason: 'signature_invalid', issues: Object.freeze(['signature.value:invalid_base64']) })
  }

  try {
    const signatureBytes = Buffer.from(signature.value, 'base64')
    if (signatureBytes.byteLength !== 64) {
      return Object.freeze({ valid: false, reason: 'signature_invalid', issues: Object.freeze(['signature.value:invalid_length']) })
    }
    const manifest = envelope.manifest as unknown as SecurityEngagementManifest
    const signingPayload = Buffer.from(serializeSecurityEngagementManifest(manifest), 'utf8')
    const verified = verifyCryptographicSignature(null, signingPayload, createPublicKey(publicKey), signatureBytes)
    if (!verified) return Object.freeze({ valid: false, reason: 'signature_invalid', issues: Object.freeze(['signature:mismatch']) })
    return Object.freeze({ valid: true, manifest })
  } catch {
    return Object.freeze({ valid: false, reason: 'signature_invalid', issues: Object.freeze(['signature:verification_failed']) })
  }
}

export interface StrangerSecuritySessionView {
  schema: typeof SECURITY_ENGAGEMENT_SCHEMA
  engagementId: string
  role: 'stranger'
  posture: Exclude<SecurityPosture, 'guardian-resident'>
  notBefore: string
  expiresAt: string
  targets: readonly Readonly<SecurityTarget>[]
  allowedActions: readonly SecurityAction[]
  scenarioGrantIds: readonly string[]
  allowedDisclosures: readonly string[]
}

export function createStrangerSecuritySessionView(
  envelope: unknown,
  trustedKeys: TrustedSecurityEngagementKeys,
  hostNow: string,
): Readonly<StrangerSecuritySessionView> {
  const verified = verifySignedSecurityEngagement(envelope, trustedKeys)
  if (verified.valid === false) throw new Error(`security_engagement_${verified.reason}`)
  const manifest = verified.manifest
  if (manifest.role !== 'stranger' || manifest.posture === 'guardian-resident') throw new Error('security_engagement_not_stranger')

  const now = Date.parse(hostNow)
  if (!Number.isFinite(now)) throw new Error('security_engagement_invalid_host_time')
  if (now < Date.parse(manifest.notBefore)) throw new Error('security_engagement_not_started')
  if (now >= Date.parse(manifest.expiresAt)) throw new Error('security_engagement_expired')

  // Intentionally whitelist fields rather than spreading the signed manifest. This prevents
  // Guardian/COS/private-memory fields from leaking into a blind Stranger session even if a
  // future signer accidentally includes unrelated metadata in the envelope.
  return Object.freeze({
    schema: SECURITY_ENGAGEMENT_SCHEMA,
    engagementId: manifest.engagementId,
    role: 'stranger',
    posture: manifest.posture,
    notBefore: manifest.notBefore,
    expiresAt: manifest.expiresAt,
    targets: Object.freeze(manifest.targets.map(target => Object.freeze({ kind: target.kind, value: target.value }))),
    allowedActions: Object.freeze([...manifest.allowedActions]),
    scenarioGrantIds: Object.freeze([...(manifest.scenarioGrantIds ?? [])]),
    allowedDisclosures: Object.freeze([...(manifest.strangerDisclosures ?? [])]),
  })
}
