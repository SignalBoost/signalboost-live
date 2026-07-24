export const PORTABLE_BROWSER_DEPLOYMENT_PACKAGE_SCHEMA_VERSION = '1.0.0' as const

export type PortableBrowserDeploymentFileRole = 'runtime' | 'configuration' | 'documentation' | 'license' | 'evidence'

export interface PortableBrowserDeploymentPackageFile {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
  readonly required: boolean
  readonly role: PortableBrowserDeploymentFileRole
}

export interface PortableBrowserDeploymentPackageManifestInput {
  readonly productId: string
  readonly productVersion: string
  readonly generatedAt: number
  readonly files: readonly PortableBrowserDeploymentPackageFile[]
}

export interface PortableBrowserDeploymentPackageManifest {
  readonly schemaVersion: typeof PORTABLE_BROWSER_DEPLOYMENT_PACKAGE_SCHEMA_VERSION
  readonly productId: string
  readonly productVersion: string
  readonly generatedAt: number
  readonly files: readonly PortableBrowserDeploymentPackageFile[]
  readonly requiredFileCount: number
  readonly totalBytes: number
}

export interface PortableBrowserDeploymentPackageObservedFile {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
}

export interface PortableBrowserDeploymentPackageVerification {
  readonly valid: boolean
  readonly missingRequiredPaths: readonly string[]
  readonly hashMismatchPaths: readonly string[]
  readonly sizeMismatchPaths: readonly string[]
  readonly unexpectedPaths: readonly string[]
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

function requireVersion(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error('portable_browser_deployment_package_version_invalid')
  }
  return value
}

function requirePath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new Error('portable_browser_deployment_package_path_invalid')
  }
  if (value.startsWith('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error('portable_browser_deployment_package_path_invalid')
  }
  const segments = value.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error('portable_browser_deployment_package_path_invalid')
  }
  return value
}

function requireSha256(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error('portable_browser_deployment_package_sha256_invalid')
  }
  return value
}

function requireBytes(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10_000_000_000) {
    throw new Error('portable_browser_deployment_package_bytes_invalid')
  }
  return value as number
}

function normalizeFile(file: PortableBrowserDeploymentPackageFile): PortableBrowserDeploymentPackageFile {
  if (!['runtime', 'configuration', 'documentation', 'license', 'evidence'].includes(file.role)) {
    throw new Error('portable_browser_deployment_package_role_invalid')
  }
  return Object.freeze({
    path: requirePath(file.path),
    sha256: requireSha256(file.sha256),
    bytes: requireBytes(file.bytes),
    required: file.required === true,
    role: file.role,
  })
}

export function buildPortableBrowserDeploymentPackageManifest(
  input: PortableBrowserDeploymentPackageManifestInput,
): PortableBrowserDeploymentPackageManifest {
  if (!input || !Array.isArray(input.files) || input.files.length === 0 || input.files.length > 4096) {
    throw new Error('portable_browser_deployment_package_files_invalid')
  }
  if (!Number.isFinite(input.generatedAt) || input.generatedAt < 0) {
    throw new Error('portable_browser_deployment_package_generated_at_invalid')
  }

  const files = input.files.map(normalizeFile).sort((a, b) => a.path.localeCompare(b.path))
  if (new Set(files.map(file => file.path)).size !== files.length) {
    throw new Error('portable_browser_deployment_package_duplicate_path')
  }

  return deepFreeze({
    schemaVersion: PORTABLE_BROWSER_DEPLOYMENT_PACKAGE_SCHEMA_VERSION,
    productId: requireIdentifier(input.productId, 'portable_browser_deployment_package_product_id_invalid'),
    productVersion: requireVersion(input.productVersion),
    generatedAt: input.generatedAt,
    files,
    requiredFileCount: files.filter(file => file.required).length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  })
}

export function verifyPortableBrowserDeploymentPackage(
  manifest: PortableBrowserDeploymentPackageManifest,
  observedFiles: readonly PortableBrowserDeploymentPackageObservedFile[],
): PortableBrowserDeploymentPackageVerification {
  if (!manifest || manifest.schemaVersion !== PORTABLE_BROWSER_DEPLOYMENT_PACKAGE_SCHEMA_VERSION) {
    throw new Error('portable_browser_deployment_package_manifest_invalid')
  }
  if (!Array.isArray(observedFiles) || observedFiles.length > 4096) {
    throw new Error('portable_browser_deployment_package_observed_files_invalid')
  }

  const observed = observedFiles.map(file => Object.freeze({
    path: requirePath(file.path),
    sha256: requireSha256(file.sha256),
    bytes: requireBytes(file.bytes),
  })).sort((a, b) => a.path.localeCompare(b.path))
  if (new Set(observed.map(file => file.path)).size !== observed.length) {
    throw new Error('portable_browser_deployment_package_observed_duplicate_path')
  }

  const expectedByPath = new Map(manifest.files.map(file => [file.path, file]))
  const observedByPath = new Map(observed.map(file => [file.path, file]))
  const missingRequiredPaths = manifest.files.filter(file => file.required && !observedByPath.has(file.path)).map(file => file.path)
  const hashMismatchPaths = manifest.files.filter(file => observedByPath.has(file.path) && observedByPath.get(file.path)!.sha256 !== file.sha256).map(file => file.path)
  const sizeMismatchPaths = manifest.files.filter(file => observedByPath.has(file.path) && observedByPath.get(file.path)!.bytes !== file.bytes).map(file => file.path)
  const unexpectedPaths = observed.filter(file => !expectedByPath.has(file.path)).map(file => file.path)

  return deepFreeze({
    valid: missingRequiredPaths.length === 0 && hashMismatchPaths.length === 0 && sizeMismatchPaths.length === 0 && unexpectedPaths.length === 0,
    missingRequiredPaths,
    hashMismatchPaths,
    sizeMismatchPaths,
    unexpectedPaths,
  })
}
