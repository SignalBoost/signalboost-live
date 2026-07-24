import type { PortableBrowserDeploymentPackageManifest, PortableBrowserDeploymentPackageVerification } from './browser-deployment-package-manifest.ts'
import type { PortableBrowserStartupPreflightResult } from './browser-startup-preflight.ts'

export const PORTABLE_BROWSER_INSTALLATION_ACCEPTANCE_SCHEMA_VERSION = '1.0.0' as const

export interface PortableBrowserInstallationAcceptanceInput {
  readonly installationId: string
  readonly evaluatedAt: number
  readonly manifest: PortableBrowserDeploymentPackageManifest
  readonly packageVerification: PortableBrowserDeploymentPackageVerification
  readonly startupPreflight: PortableBrowserStartupPreflightResult
}

export interface PortableBrowserInstallationAcceptanceReport {
  readonly schemaVersion: typeof PORTABLE_BROWSER_INSTALLATION_ACCEPTANCE_SCHEMA_VERSION
  readonly installationId: string
  readonly evaluatedAt: number
  readonly productId: string
  readonly productVersion: string
  readonly providerId: string
  readonly accepted: boolean
  readonly checks: readonly Readonly<{
    id: 'package_integrity' | 'startup_preflight'
    passed: boolean
    required: true
  }>[]
  readonly failureCodes: readonly string[]
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function requireIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(value)) {
    throw new Error('portable_browser_installation_acceptance_installation_id_invalid')
  }
  return value
}

function requireTimestamp(value: unknown): number {
  if (!Number.isFinite(value) || (value as number) < 0) {
    throw new Error('portable_browser_installation_acceptance_evaluated_at_invalid')
  }
  return value as number
}

function packageFailureCodes(verification: PortableBrowserDeploymentPackageVerification): string[] {
  const failures: string[] = []
  for (const path of verification.missingRequiredPaths) failures.push(`package_missing_required:${path}`)
  for (const path of verification.hashMismatchPaths) failures.push(`package_hash_mismatch:${path}`)
  for (const path of verification.sizeMismatchPaths) failures.push(`package_size_mismatch:${path}`)
  for (const path of verification.unexpectedPaths) failures.push(`package_unexpected_file:${path}`)
  if (!verification.valid && failures.length === 0) failures.push('package_integrity_invalid')
  return failures
}

export function buildPortableBrowserInstallationAcceptanceReport(
  input: PortableBrowserInstallationAcceptanceInput,
): PortableBrowserInstallationAcceptanceReport {
  if (!input?.manifest || !input.packageVerification || !input.startupPreflight) {
    throw new Error('portable_browser_installation_acceptance_input_invalid')
  }

  const checks = [
    Object.freeze({ id: 'package_integrity' as const, passed: input.packageVerification.valid === true, required: true as const }),
    Object.freeze({ id: 'startup_preflight' as const, passed: input.startupPreflight.ready === true, required: true as const }),
  ].sort((a, b) => a.id.localeCompare(b.id))

  const failureCodes = [
    ...packageFailureCodes(input.packageVerification),
    ...input.startupPreflight.errors.map(error => `preflight:${error}`),
  ].sort()

  return deepFreeze({
    schemaVersion: PORTABLE_BROWSER_INSTALLATION_ACCEPTANCE_SCHEMA_VERSION,
    installationId: requireIdentifier(input.installationId),
    evaluatedAt: requireTimestamp(input.evaluatedAt),
    productId: input.manifest.productId,
    productVersion: input.manifest.productVersion,
    providerId: input.startupPreflight.providerId,
    accepted: checks.every(check => check.passed) && failureCodes.length === 0,
    checks,
    failureCodes,
  })
}
