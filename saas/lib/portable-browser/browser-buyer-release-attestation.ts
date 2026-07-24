import {
  PORTABLE_BROWSER_INSTALLATION_ACCEPTANCE_SCHEMA_VERSION,
  type PortableBrowserInstallationAcceptanceReport,
} from './browser-installation-acceptance.ts'

export const PORTABLE_BROWSER_BUYER_RELEASE_ATTESTATION_SCHEMA_VERSION = '1.0.0' as const

export interface PortableBrowserBuyerReleaseAttestationInput {
  readonly attestationId: string
  readonly issuerId: string
  readonly issuedAt: number
  readonly acceptance: PortableBrowserInstallationAcceptanceReport
}

export interface PortableBrowserBuyerReleaseAttestation {
  readonly schemaVersion: typeof PORTABLE_BROWSER_BUYER_RELEASE_ATTESTATION_SCHEMA_VERSION
  readonly attestationId: string
  readonly issuerId: string
  readonly issuedAt: number
  readonly purpose: 'buyer_release_attestation'
  readonly subject: Readonly<{
    productId: string
    productVersion: string
    installationId: string
    providerId: string
  }>
  readonly acceptanceEvaluatedAt: number
  readonly acceptanceChecks: readonly string[]
  readonly releaseApproved: true
  readonly signingPayload: string
  readonly signatureRequired: true
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function requireIdentifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) throw new Error(code)
  return value
}

function requireTimestamp(value: unknown, code: string): number {
  if (!Number.isFinite(value) || (value as number) < 0) throw new Error(code)
  return value as number
}

export function buildPortableBrowserBuyerReleaseAttestation(
  input: PortableBrowserBuyerReleaseAttestationInput,
): PortableBrowserBuyerReleaseAttestation {
  const acceptance = input?.acceptance
  if (!acceptance || acceptance.schemaVersion !== PORTABLE_BROWSER_INSTALLATION_ACCEPTANCE_SCHEMA_VERSION) {
    throw new Error('portable_browser_buyer_release_attestation_acceptance_invalid')
  }
  if (!acceptance.accepted || acceptance.failureCodes.length > 0 || acceptance.checks.some(check => !check.passed)) {
    throw new Error('portable_browser_buyer_release_attestation_acceptance_required')
  }

  const attestationId = requireIdentifier(input.attestationId, 'portable_browser_buyer_release_attestation_id_invalid')
  const issuerId = requireIdentifier(input.issuerId, 'portable_browser_buyer_release_attestation_issuer_id_invalid')
  const issuedAt = requireTimestamp(input.issuedAt, 'portable_browser_buyer_release_attestation_issued_at_invalid')
  if (issuedAt < acceptance.evaluatedAt) {
    throw new Error('portable_browser_buyer_release_attestation_issued_before_acceptance')
  }

  const acceptanceChecks = Object.freeze(acceptance.checks.map(check => check.id).sort())
  const subject = Object.freeze({
    productId: acceptance.productId,
    productVersion: acceptance.productVersion,
    installationId: acceptance.installationId,
    providerId: acceptance.providerId,
  })
  const signingPayload = JSON.stringify({
    schemaVersion: PORTABLE_BROWSER_BUYER_RELEASE_ATTESTATION_SCHEMA_VERSION,
    attestationId,
    issuerId,
    issuedAt,
    purpose: 'buyer_release_attestation',
    subject,
    acceptanceEvaluatedAt: acceptance.evaluatedAt,
    acceptanceChecks,
    releaseApproved: true,
  })

  return deepFreeze({
    schemaVersion: PORTABLE_BROWSER_BUYER_RELEASE_ATTESTATION_SCHEMA_VERSION,
    attestationId,
    issuerId,
    issuedAt,
    purpose: 'buyer_release_attestation',
    subject,
    acceptanceEvaluatedAt: acceptance.evaluatedAt,
    acceptanceChecks,
    releaseApproved: true as const,
    signingPayload,
    signatureRequired: true as const,
  })
}
