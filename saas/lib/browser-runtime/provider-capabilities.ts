import type { BrowserSessionFactory, BrowserSessionPort } from './contracts.ts'

export const BROWSER_PROVIDER_CAPABILITIES_SCHEMA_VERSION = '1.0.0' as const

export interface BrowserProviderCapabilities {
  readonly schemaVersion: typeof BROWSER_PROVIDER_CAPABILITIES_SCHEMA_VERSION
  readonly provider: string
  readonly sessionSnapshotCapture: boolean
  readonly sessionSnapshotRestore: boolean
  readonly profileExport: boolean
  readonly profileImport: boolean
}

export interface BrowserSessionFactoryWithCapabilities extends BrowserSessionFactory {
  readonly capabilities: BrowserProviderCapabilities
}

export interface BrowserSessionMigrationCapabilityRequest {
  readonly sourceSession: BrowserSessionPort
  readonly targetFactory: BrowserSessionFactory
  readonly includeProfile?: boolean
}

export interface BrowserSessionMigrationCapabilityResult {
  readonly compatible: boolean
  readonly source: Readonly<{
    sessionSnapshotCapture: true
    profileExport: boolean
  }>
  readonly target?: BrowserProviderCapabilities
  readonly required: readonly ('session_snapshot_capture' | 'session_snapshot_restore' | 'profile_export' | 'profile_import')[]
  readonly missing: readonly ('session_snapshot_restore' | 'profile_export' | 'profile_import')[]
}

function requireProvider(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) {
    throw new Error('browser_provider_capabilities_provider_invalid')
  }
  return value
}

export function normalizeBrowserProviderCapabilities(value: BrowserProviderCapabilities): BrowserProviderCapabilities {
  if (!value || value.schemaVersion !== BROWSER_PROVIDER_CAPABILITIES_SCHEMA_VERSION) {
    throw new Error('browser_provider_capabilities_schema_invalid')
  }

  for (const field of ['sessionSnapshotCapture', 'sessionSnapshotRestore', 'profileExport', 'profileImport'] as const) {
    if (typeof value[field] !== 'boolean') throw new Error('browser_provider_capabilities_value_invalid')
  }

  return Object.freeze({
    schemaVersion: BROWSER_PROVIDER_CAPABILITIES_SCHEMA_VERSION,
    provider: requireProvider(value.provider),
    sessionSnapshotCapture: value.sessionSnapshotCapture,
    sessionSnapshotRestore: value.sessionSnapshotRestore,
    profileExport: value.profileExport,
    profileImport: value.profileImport,
  })
}

export function getBrowserSessionFactoryCapabilities(
  factory: BrowserSessionFactory,
): BrowserProviderCapabilities | undefined {
  const candidate = (factory as Partial<BrowserSessionFactoryWithCapabilities>).capabilities
  return candidate === undefined ? undefined : normalizeBrowserProviderCapabilities(candidate)
}

export function negotiateBrowserSessionMigrationCapabilities(
  request: BrowserSessionMigrationCapabilityRequest,
): BrowserSessionMigrationCapabilityResult {
  if (!request?.sourceSession?.page || typeof request.sourceSession.close !== 'function') {
    throw new Error('browser_provider_capabilities_source_invalid')
  }
  if (!request.targetFactory || typeof request.targetFactory.open !== 'function') {
    throw new Error('browser_provider_capabilities_target_invalid')
  }

  const includeProfile = request.includeProfile === true
  const sourceProfileExport = typeof request.sourceSession.profile?.exportProfile === 'function'
  const target = getBrowserSessionFactoryCapabilities(request.targetFactory)
  const required = [
    'session_snapshot_capture',
    'session_snapshot_restore',
    ...(includeProfile ? ['profile_export', 'profile_import'] as const : []),
  ] as const
  const missing: ('session_snapshot_restore' | 'profile_export' | 'profile_import')[] = []

  if (target?.sessionSnapshotRestore === false) missing.push('session_snapshot_restore')
  if (includeProfile && !sourceProfileExport) missing.push('profile_export')
  if (includeProfile && target?.profileImport === false) missing.push('profile_import')

  return Object.freeze({
    compatible: missing.length === 0,
    source: Object.freeze({ sessionSnapshotCapture: true as const, profileExport: sourceProfileExport }),
    ...(target ? { target } : {}),
    required: Object.freeze([...required]),
    missing: Object.freeze([...missing]),
  })
}

export function assertBrowserSessionMigrationCapabilities(
  request: BrowserSessionMigrationCapabilityRequest,
): BrowserSessionMigrationCapabilityResult {
  const result = negotiateBrowserSessionMigrationCapabilities(request)
  if (!result.compatible) {
    throw new Error(`browser_session_migration_capability_mismatch:${result.missing.join(',')}`)
  }
  return result
}
