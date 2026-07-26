import { portableProductRegistry } from './product-registry.ts'

export const portableLicenseEvidenceSchemaVersion = 'portable-license-evidence.v1' as const

export type PortableLicenseEvidenceBlocker =
  | 'identity'
  | 'scope'
  | 'decision'
  | 'reference'
  | 'timestamps'
  | 'unsafe-state'

type RecordValue = Record<string, unknown>
const REFERENCE = /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~!$&'()*+,;=:@%\/?#\[\]-]+$/
const UNSAFE = /BEGIN\s|PRIVATE\s+KEY|password|secret=|token=|bearer\s|client_email|private_key/i
const CAPABILITY = /^[a-z][a-z0-9.-]{1,79}$/
const SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null
}

function validReference(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 512 && REFERENCE.test(value) && !UNSAFE.test(value)
}

function validTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validatePortableLicenseEvidence(inputValue: unknown) {
  const input = record(inputValue)
  const blockers: PortableLicenseEvidenceBlocker[] = []
  const productId = typeof input?.productId === 'string' ? input.productId.trim() : ''
  const registered = portableProductRegistry.some(item => item.manifest.productId === productId)
  if (!registered) blockers.push('identity')

  const tenantId = typeof input?.tenantId === 'string' ? input.tenantId.trim() : ''
  const environmentId = typeof input?.environmentId === 'string' ? input.environmentId.trim() : ''
  const capability = typeof input?.capability === 'string' ? input.capability.trim() : ''
  if (!SCOPE.test(tenantId) || !SCOPE.test(environmentId) || !CAPABILITY.test(capability)) blockers.push('scope')

  const decision = input?.decision
  if (decision !== 'entitled' && decision !== 'not-entitled' && decision !== 'pending') blockers.push('decision')

  const entitlementReference = input?.entitlementReference
  if (decision === 'entitled' && !validReference(entitlementReference)) blockers.push('reference')
  if (decision !== 'entitled' && entitlementReference !== undefined && entitlementReference !== '') blockers.push('reference')

  const evaluatedAt = validTimestamp(input?.evaluatedAt)
  const expiresAt = input?.expiresAt === undefined ? null : validTimestamp(input.expiresAt)
  if (evaluatedAt === null || (input?.expiresAt !== undefined && expiresAt === null) || (evaluatedAt !== null && expiresAt !== null && expiresAt < evaluatedAt)) blockers.push('timestamps')

  if (
    input?.readOnly !== true ||
    input?.checkoutInvoked !== false ||
    input?.billingMutationPerformed !== false ||
    input?.entitlementMutationPerformed !== false ||
    input?.credentialTransferred !== false ||
    input?.productionExecutionEnabled !== false
  ) blockers.push('unsafe-state')

  return Object.freeze({
    schemaVersion: portableLicenseEvidenceSchemaVersion,
    productId,
    tenantId,
    environmentId,
    capability,
    decision: decision === 'entitled' || decision === 'not-entitled' || decision === 'pending' ? decision : 'pending',
    entitlementReference: validReference(entitlementReference) ? entitlementReference : '',
    evaluatedAt: evaluatedAt === null ? '' : String(input?.evaluatedAt),
    expiresAt: expiresAt === null ? '' : String(input?.expiresAt),
    state: blockers.length === 0 ? 'license_evidence_validated' : 'blocked',
    blockers: Object.freeze([...new Set(blockers)]),
    readOnly: true,
    checkoutInvoked: false,
    billingMutationPerformed: false,
    entitlementMutationPerformed: false,
    credentialTransferred: false,
    productionExecutionEnabled: false,
  })
}
