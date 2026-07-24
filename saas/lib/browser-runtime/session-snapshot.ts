import type { BrowserSessionPort } from './contracts.ts'
import {
  normalizeBrowserProfileSnapshot,
  type BrowserProfileSnapshot,
} from './profile-portability.ts'

export const BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION = '1.0.0' as const

export interface BrowserSessionSnapshot {
  readonly schemaVersion: typeof BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION
  readonly snapshotId: string
  readonly createdAt: string
  readonly currentUrl: string
  readonly profile?: BrowserProfileSnapshot
}

export interface CaptureBrowserSessionSnapshotInput {
  readonly snapshotId: string
  readonly createdAt: string
  readonly includeProfile?: boolean
}

export interface RestoreBrowserSessionSnapshotOptions {
  readonly allowedOrigins: readonly string[]
  readonly restoreProfile?: boolean
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function requireIdentifier(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) throw new Error(code)
  return value
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new Error('browser_session_snapshot_created_at_invalid')
  }
  return new Date(value).toISOString()
}

function normalizeHttpUrl(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192 || value.includes('\0')) throw new Error(code)
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error(code) }
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) throw new Error(code)
  return parsed.toString()
}

function normalizeAllowedOrigins(values: readonly string[]): ReadonlySet<string> {
  if (!Array.isArray(values) || values.length === 0 || values.length > 1024) {
    throw new Error('browser_session_snapshot_allowed_origins_invalid')
  }
  const origins = values.map(value => {
    const url = normalizeHttpUrl(value, 'browser_session_snapshot_allowed_origin_invalid')
    const parsed = new URL(url)
    if (parsed.origin !== value) throw new Error('browser_session_snapshot_allowed_origin_invalid')
    return parsed.origin
  })
  if (new Set(origins).size !== origins.length) throw new Error('browser_session_snapshot_allowed_origin_duplicate')
  return new Set(origins)
}

export function normalizeBrowserSessionSnapshot(value: BrowserSessionSnapshot): BrowserSessionSnapshot {
  if (!value || value.schemaVersion !== BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error('browser_session_snapshot_schema_invalid')
  }
  const snapshotId = requireIdentifier(value.snapshotId, 'browser_session_snapshot_id_invalid')
  const createdAt = requireTimestamp(value.createdAt)
  const currentUrl = normalizeHttpUrl(value.currentUrl, 'browser_session_snapshot_url_invalid')
  const profile = value.profile === undefined ? undefined : normalizeBrowserProfileSnapshot(value.profile)
  return deepFreeze({
    schemaVersion: BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION,
    snapshotId,
    createdAt,
    currentUrl,
    ...(profile ? { profile } : {}),
  })
}

export async function captureBrowserSessionSnapshot(
  session: BrowserSessionPort,
  input: CaptureBrowserSessionSnapshotInput,
): Promise<BrowserSessionSnapshot> {
  if (!session?.page || typeof session.page.url !== 'function') throw new Error('browser_session_snapshot_session_invalid')
  if (!input || typeof input !== 'object') throw new Error('browser_session_snapshot_input_invalid')
  const includeProfile = input.includeProfile !== false
  let profile: BrowserProfileSnapshot | undefined
  if (includeProfile) {
    if (!session.profile || typeof session.profile.exportProfile !== 'function') {
      throw new Error('browser_session_snapshot_profile_export_unsupported')
    }
    profile = await session.profile.exportProfile()
  }
  return normalizeBrowserSessionSnapshot({
    schemaVersion: BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: input.snapshotId,
    createdAt: input.createdAt,
    currentUrl: session.page.url(),
    ...(profile ? { profile } : {}),
  })
}

export async function restoreBrowserSessionSnapshot(
  session: BrowserSessionPort,
  snapshot: BrowserSessionSnapshot,
  options: RestoreBrowserSessionSnapshotOptions,
): Promise<void> {
  if (!session?.page || typeof session.page.goto !== 'function') throw new Error('browser_session_snapshot_session_invalid')
  if (!options || typeof options !== 'object') throw new Error('browser_session_snapshot_options_invalid')
  const normalized = normalizeBrowserSessionSnapshot(snapshot)
  const allowedOrigins = normalizeAllowedOrigins(options.allowedOrigins)
  const destinationOrigin = new URL(normalized.currentUrl).origin
  if (!allowedOrigins.has(destinationOrigin)) throw new Error('browser_session_snapshot_origin_rejected')

  const restoreProfile = options.restoreProfile !== false
  if (restoreProfile && normalized.profile) {
    if (!session.profile || typeof session.profile.importProfile !== 'function') {
      throw new Error('browser_session_snapshot_profile_import_unsupported')
    }
    await session.profile.importProfile(normalized.profile)
  }
  await session.page.goto(normalized.currentUrl)
}

export function serializeBrowserSessionSnapshot(snapshot: BrowserSessionSnapshot): string {
  return JSON.stringify(normalizeBrowserSessionSnapshot(snapshot))
}

export function deserializeBrowserSessionSnapshot(payload: string): BrowserSessionSnapshot {
  if (typeof payload !== 'string' || payload.length === 0 || payload.length > 30_000_000) {
    throw new Error('browser_session_snapshot_payload_invalid')
  }
  let parsed: unknown
  try { parsed = JSON.parse(payload) } catch { throw new Error('browser_session_snapshot_payload_invalid') }
  return normalizeBrowserSessionSnapshot(parsed as BrowserSessionSnapshot)
}
