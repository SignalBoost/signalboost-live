import type {
  BrowserSessionFactory,
  BrowserSessionLaunchRequest,
  BrowserSessionPort,
} from './contracts.ts'
import {
  captureBrowserSessionSnapshot,
  restoreBrowserSessionSnapshot,
  type BrowserSessionSnapshot,
} from './session-snapshot.ts'

export interface BrowserSessionMigrationRequest {
  readonly migrationId: string
  readonly createdAt: string
  readonly sourceSession: BrowserSessionPort
  readonly targetFactory: BrowserSessionFactory
  readonly targetLaunchRequest: BrowserSessionLaunchRequest
  readonly allowedOrigins: readonly string[]
  readonly includeProfile?: boolean
  readonly closeSourceOnSuccess?: boolean
}

export interface BrowserSessionMigrationResult {
  readonly migrationId: string
  readonly migratedAt: string
  readonly snapshot: BrowserSessionSnapshot
  readonly targetSession: BrowserSessionPort
  readonly sourceClosed: boolean
}

function requireMigrationId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) {
    throw new Error('browser_session_migration_id_invalid')
  }
  return value
}

function requireTimestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64 || !Number.isFinite(Date.parse(value))) {
    throw new Error('browser_session_migration_created_at_invalid')
  }
  return new Date(value).toISOString()
}

function assertRequest(request: BrowserSessionMigrationRequest): void {
  if (!request?.sourceSession?.page || typeof request.sourceSession.close !== 'function') {
    throw new Error('browser_session_migration_source_invalid')
  }
  if (!request.targetFactory || typeof request.targetFactory.open !== 'function') {
    throw new Error('browser_session_migration_target_factory_invalid')
  }
  if (!request.targetLaunchRequest || typeof request.targetLaunchRequest !== 'object') {
    throw new Error('browser_session_migration_launch_request_invalid')
  }
  if (!Array.isArray(request.allowedOrigins) || request.allowedOrigins.length === 0) {
    throw new Error('browser_session_migration_allowed_origins_invalid')
  }
}

export async function migrateBrowserSession(
  request: BrowserSessionMigrationRequest,
): Promise<BrowserSessionMigrationResult> {
  assertRequest(request)
  const migrationId = requireMigrationId(request.migrationId)
  const migratedAt = requireTimestamp(request.createdAt)

  const snapshot = await captureBrowserSessionSnapshot(request.sourceSession, {
    snapshotId: migrationId,
    createdAt: migratedAt,
    includeProfile: request.includeProfile,
  })

  let targetSession: BrowserSessionPort | undefined
  try {
    targetSession = await request.targetFactory.open(request.targetLaunchRequest)
    await restoreBrowserSessionSnapshot(targetSession, snapshot, {
      allowedOrigins: request.allowedOrigins,
      restoreProfile: request.includeProfile,
    })
  } catch (error) {
    await targetSession?.close().catch(() => undefined)
    throw error
  }

  let sourceClosed = false
  if (request.closeSourceOnSuccess === true) {
    await request.sourceSession.close()
    sourceClosed = true
  }

  return Object.freeze({
    migrationId,
    migratedAt,
    snapshot,
    targetSession,
    sourceClosed,
  })
}
