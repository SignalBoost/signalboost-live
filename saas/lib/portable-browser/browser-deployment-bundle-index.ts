import {
  PORTABLE_BROWSER_BUYER_RELEASE_ATTESTATION_SCHEMA_VERSION,
  type PortableBrowserBuyerReleaseAttestation,
} from './browser-buyer-release-attestation.ts'

export const PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_INDEX_SCHEMA_VERSION = '1.0.0' as const

export type PortableBrowserDeploymentBundleArtifactRole =
  | 'package_manifest'
  | 'installation_acceptance'
  | 'release_attestation'
  | 'documentation'
  | 'license'
  | 'evidence'

export interface PortableBrowserDeploymentBundleArtifact {
  readonly path: string
  readonly role: PortableBrowserDeploymentBundleArtifactRole
  readonly mediaType: string
  readonly sha256: string
  readonly bytes: number
  readonly required: boolean
}

export interface PortableBrowserDeploymentBundleIndexInput {
  readonly bundleId: string
  readonly createdAt: number
  readonly attestation: PortableBrowserBuyerReleaseAttestation
  readonly artifacts: readonly PortableBrowserDeploymentBundleArtifact[]
}

export interface PortableBrowserDeploymentBundleIndex {
  readonly schemaVersion: typeof PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_INDEX_SCHEMA_VERSION
  readonly bundleId: string
  readonly createdAt: number
  readonly productId: string
  readonly productVersion: string
  readonly installationId: string
  readonly providerId: string
  readonly issuerId: string
  readonly attestationId: string
  readonly artifacts: readonly PortableBrowserDeploymentBundleArtifact[]
  readonly requiredArtifactCount: number
  readonly totalBytes: number
  readonly canonicalIndexPayload: string
}

const REQUIRED_ROLES: readonly PortableBrowserDeploymentBundleArtifactRole[] = Object.freeze([
  'installation_acceptance',
  'package_manifest',
  'release_attestation',
])

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

function requireTimestamp(value: unknown): number {
  if (!Number.isFinite(value) || (value as number) < 0) {
    throw new Error('portable_browser_deployment_bundle_created_at_invalid')
  }
  return value as number
}

function requirePath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error('portable_browser_deployment_bundle_path_invalid')
  }
  const segments = value.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error('portable_browser_deployment_bundle_path_invalid')
  }
  return value
}

function requireMediaType(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128 || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(value)) {
    throw new Error('portable_browser_deployment_bundle_media_type_invalid')
  }
  return value
}

function requireSha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('portable_browser_deployment_bundle_sha256_invalid')
  }
  return value
}

function requireBytes(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000_000_000) {
    throw new Error('portable_browser_deployment_bundle_bytes_invalid')
  }
  return value as number
}

function normalizeArtifact(artifact: PortableBrowserDeploymentBundleArtifact): PortableBrowserDeploymentBundleArtifact {
  const roles: readonly string[] = ['package_manifest', 'installation_acceptance', 'release_attestation', 'documentation', 'license', 'evidence']
  if (!artifact || !roles.includes(artifact.role)) throw new Error('portable_browser_deployment_bundle_role_invalid')
  return Object.freeze({
    path: requirePath(artifact.path),
    role: artifact.role,
    mediaType: requireMediaType(artifact.mediaType),
    sha256: requireSha256(artifact.sha256),
    bytes: requireBytes(artifact.bytes),
    required: artifact.required === true,
  })
}

export function buildPortableBrowserDeploymentBundleIndex(
  input: PortableBrowserDeploymentBundleIndexInput,
): PortableBrowserDeploymentBundleIndex {
  const attestation = input?.attestation
  if (!attestation || attestation.schemaVersion !== PORTABLE_BROWSER_BUYER_RELEASE_ATTESTATION_SCHEMA_VERSION || !attestation.releaseApproved) {
    throw new Error('portable_browser_deployment_bundle_attestation_invalid')
  }
  if (!Array.isArray(input.artifacts) || input.artifacts.length === 0 || input.artifacts.length > 4096) {
    throw new Error('portable_browser_deployment_bundle_artifacts_invalid')
  }

  const bundleId = requireIdentifier(input.bundleId, 'portable_browser_deployment_bundle_id_invalid')
  const createdAt = requireTimestamp(input.createdAt)
  if (createdAt < attestation.issuedAt) throw new Error('portable_browser_deployment_bundle_created_before_attestation')

  const artifacts = input.artifacts.map(normalizeArtifact).sort((a, b) => a.path.localeCompare(b.path))
  if (new Set(artifacts.map(artifact => artifact.path)).size !== artifacts.length) {
    throw new Error('portable_browser_deployment_bundle_duplicate_path')
  }
  for (const role of REQUIRED_ROLES) {
    const matching = artifacts.filter(artifact => artifact.role === role)
    if (matching.length !== 1 || matching[0].required !== true) {
      throw new Error(`portable_browser_deployment_bundle_required_role_invalid:${role}`)
    }
  }

  const identity = {
    productId: attestation.subject.productId,
    productVersion: attestation.subject.productVersion,
    installationId: attestation.subject.installationId,
    providerId: attestation.subject.providerId,
    issuerId: attestation.issuerId,
    attestationId: attestation.attestationId,
  }
  const canonicalIndexPayload = JSON.stringify({
    schemaVersion: PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_INDEX_SCHEMA_VERSION,
    bundleId,
    createdAt,
    ...identity,
    artifacts,
  })

  return deepFreeze({
    schemaVersion: PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_INDEX_SCHEMA_VERSION,
    bundleId,
    createdAt,
    ...identity,
    artifacts,
    requiredArtifactCount: artifacts.filter(artifact => artifact.required).length,
    totalBytes: artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    canonicalIndexPayload,
  })
}
