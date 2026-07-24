import {
  PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_INDEX_SCHEMA_VERSION,
  type PortableBrowserDeploymentBundleIndex,
} from './browser-deployment-bundle-index.ts'

export const PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_VERIFICATION_SCHEMA_VERSION = '1.0.0' as const

export interface PortableBrowserObservedBundleArtifact {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
}

export interface PortableBrowserDeploymentBundleVerification {
  readonly schemaVersion: typeof PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_VERIFICATION_SCHEMA_VERSION
  readonly bundleId: string
  readonly productId: string
  readonly productVersion: string
  readonly installationId: string
  readonly providerId: string
  readonly verified: boolean
  readonly missingRequiredPaths: readonly string[]
  readonly hashMismatchPaths: readonly string[]
  readonly sizeMismatchPaths: readonly string[]
  readonly unexpectedPaths: readonly string[]
  readonly failureCodes: readonly string[]
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function requirePath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error('portable_browser_deployment_bundle_verification_path_invalid')
  }
  const segments = value.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error('portable_browser_deployment_bundle_verification_path_invalid')
  }
  return value
}

function requireSha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('portable_browser_deployment_bundle_verification_sha256_invalid')
  }
  return value
}

function requireBytes(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000_000_000) {
    throw new Error('portable_browser_deployment_bundle_verification_bytes_invalid')
  }
  return value as number
}

export function verifyPortableBrowserDeploymentBundle(
  index: PortableBrowserDeploymentBundleIndex,
  observedArtifacts: readonly PortableBrowserObservedBundleArtifact[],
): PortableBrowserDeploymentBundleVerification {
  if (!index || index.schemaVersion !== PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_INDEX_SCHEMA_VERSION) {
    throw new Error('portable_browser_deployment_bundle_verification_index_invalid')
  }
  if (!Array.isArray(observedArtifacts) || observedArtifacts.length > 4096) {
    throw new Error('portable_browser_deployment_bundle_verification_observed_invalid')
  }

  const observed = observedArtifacts.map(artifact => Object.freeze({
    path: requirePath(artifact.path),
    sha256: requireSha256(artifact.sha256),
    bytes: requireBytes(artifact.bytes),
  })).sort((a, b) => a.path.localeCompare(b.path))

  if (new Set(observed.map(artifact => artifact.path)).size !== observed.length) {
    throw new Error('portable_browser_deployment_bundle_verification_duplicate_path')
  }

  const expectedByPath = new Map(index.artifacts.map(artifact => [artifact.path, artifact]))
  const observedByPath = new Map(observed.map(artifact => [artifact.path, artifact]))
  const missingRequiredPaths = index.artifacts
    .filter(artifact => artifact.required && !observedByPath.has(artifact.path))
    .map(artifact => artifact.path)
    .sort()
  const hashMismatchPaths = index.artifacts
    .filter(artifact => observedByPath.has(artifact.path) && observedByPath.get(artifact.path)!.sha256 !== artifact.sha256)
    .map(artifact => artifact.path)
    .sort()
  const sizeMismatchPaths = index.artifacts
    .filter(artifact => observedByPath.has(artifact.path) && observedByPath.get(artifact.path)!.bytes !== artifact.bytes)
    .map(artifact => artifact.path)
    .sort()
  const unexpectedPaths = observed
    .filter(artifact => !expectedByPath.has(artifact.path))
    .map(artifact => artifact.path)
    .sort()

  const failureCodes = [
    ...missingRequiredPaths.map(path => `bundle_missing_required:${path}`),
    ...hashMismatchPaths.map(path => `bundle_hash_mismatch:${path}`),
    ...sizeMismatchPaths.map(path => `bundle_size_mismatch:${path}`),
    ...unexpectedPaths.map(path => `bundle_unexpected_artifact:${path}`),
  ].sort()

  return deepFreeze({
    schemaVersion: PORTABLE_BROWSER_DEPLOYMENT_BUNDLE_VERIFICATION_SCHEMA_VERSION,
    bundleId: index.bundleId,
    productId: index.productId,
    productVersion: index.productVersion,
    installationId: index.installationId,
    providerId: index.providerId,
    verified: failureCodes.length === 0,
    missingRequiredPaths,
    hashMismatchPaths,
    sizeMismatchPaths,
    unexpectedPaths,
    failureCodes,
  })
}
