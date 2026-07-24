import type { PortableBrowserSessionPort } from './browser-session-port.ts'
import type { PortableBrowserSessionRef, PortableBrowserTenantScope } from './browser-runtime-types.ts'

export type PortableBrowserSessionState = 'active' | 'closing' | 'closed' | 'expired' | 'failed'
export type PortableBrowserSessionCloseReason = 'requested' | 'expired' | 'shutdown' | 'open_failed' | 'close_failed'

export interface PortableBrowserClock {
  now(): number
}

export interface PortableBrowserSessionLifecycleConfiguration {
  readonly sessionPort: PortableBrowserSessionPort
  readonly clock: PortableBrowserClock
  readonly maximumConcurrentSessions: number
  readonly maximumSessionAgeMs: number
}

export interface PortableBrowserManagedSessionSnapshot {
  readonly sessionId: string
  readonly tenantId: string
  readonly state: PortableBrowserSessionState
  readonly openedAt: number
  readonly lastActivityAt: number
  readonly expiresAt: number
  readonly closeReason?: PortableBrowserSessionCloseReason
  readonly error?: string
}

export interface PortableBrowserLifecycleHealthSnapshot {
  readonly status: 'healthy' | 'degraded'
  readonly activeSessions: number
  readonly trackedSessions: number
  readonly maximumConcurrentSessions: number
  readonly expiredSessions: number
  readonly failedSessions: number
}

interface ManagedSessionRecord {
  readonly session: PortableBrowserSessionRef
  readonly tenantId: string
  state: PortableBrowserSessionState
  readonly openedAt: number
  lastActivityAt: number
  expiresAt: number
  closeReason?: PortableBrowserSessionCloseReason
  error?: string
}

function requirePositiveInteger(value: number, code: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(code)
  return value
}

function requireTimestamp(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('portable_browser_clock_invalid')
  return value
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/(?:token|secret|password|api[-_ ]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]').slice(0, 512)
}

export class PortableBrowserSessionLifecycleManager {
  private readonly sessionPort: PortableBrowserSessionPort
  private readonly clock: PortableBrowserClock
  private readonly maximumConcurrentSessions: number
  private readonly maximumSessionAgeMs: number
  private readonly records = new Map<string, ManagedSessionRecord>()

  constructor(configuration: PortableBrowserSessionLifecycleConfiguration) {
    if (!configuration?.sessionPort || typeof configuration.sessionPort.create !== 'function' || typeof configuration.sessionPort.close !== 'function') {
      throw new Error('portable_browser_session_port_required')
    }
    if (!configuration.clock || typeof configuration.clock.now !== 'function') throw new Error('portable_browser_clock_required')
    this.sessionPort = configuration.sessionPort
    this.clock = configuration.clock
    this.maximumConcurrentSessions = requirePositiveInteger(configuration.maximumConcurrentSessions, 'portable_browser_session_limit_invalid')
    this.maximumSessionAgeMs = requirePositiveInteger(configuration.maximumSessionAgeMs, 'portable_browser_session_age_invalid')
  }

  async open(scope: PortableBrowserTenantScope): Promise<PortableBrowserSessionRef> {
    await this.reapExpired()
    if (this.activeCount() >= this.maximumConcurrentSessions) throw new Error('portable_browser_session_capacity_exceeded')
    const openedAt = requireTimestamp(this.clock.now())
    let session: PortableBrowserSessionRef
    try {
      session = await this.sessionPort.create(scope)
    } catch (error) {
      throw new Error(`portable_browser_session_open_failed:${safeError(error)}`)
    }
    if (!session?.sessionId || this.records.has(session.sessionId)) {
      try { await this.sessionPort.close(session) } catch { /* best-effort cleanup */ }
      throw new Error('portable_browser_session_identity_invalid')
    }
    this.records.set(session.sessionId, {
      session,
      tenantId: scope.tenantId,
      state: 'active',
      openedAt,
      lastActivityAt: openedAt,
      expiresAt: openedAt + this.maximumSessionAgeMs,
    })
    return Object.freeze({ sessionId: session.sessionId })
  }

  touch(sessionId: string): void {
    const record = this.requireActive(sessionId)
    const now = requireTimestamp(this.clock.now())
    if (now >= record.expiresAt) throw new Error('portable_browser_session_expired')
    record.lastActivityAt = now
  }

  async close(sessionId: string, reason: PortableBrowserSessionCloseReason = 'requested'): Promise<void> {
    const record = this.records.get(sessionId)
    if (!record || record.state === 'closed' || record.state === 'expired') return
    if (record.state === 'closing') throw new Error('portable_browser_session_close_in_progress')
    record.state = 'closing'
    record.closeReason = reason
    try {
      await this.sessionPort.close(record.session)
      record.state = reason === 'expired' ? 'expired' : 'closed'
    } catch (error) {
      record.state = 'failed'
      record.closeReason = 'close_failed'
      record.error = safeError(error)
      throw new Error(`portable_browser_session_close_failed:${record.error}`)
    }
  }

  async reapExpired(): Promise<readonly string[]> {
    const now = requireTimestamp(this.clock.now())
    const expired = [...this.records.values()]
      .filter(record => record.state === 'active' && now >= record.expiresAt)
      .sort((a, b) => a.session.sessionId.localeCompare(b.session.sessionId))
    const closed: string[] = []
    for (const record of expired) {
      try {
        await this.close(record.session.sessionId, 'expired')
        closed.push(record.session.sessionId)
      } catch {
        // Failure is retained in diagnostics and cleanup continues for other sessions.
      }
    }
    return Object.freeze(closed)
  }

  async shutdown(): Promise<readonly string[]> {
    const active = [...this.records.values()]
      .filter(record => record.state === 'active')
      .sort((a, b) => a.session.sessionId.localeCompare(b.session.sessionId))
    const closed: string[] = []
    for (const record of active) {
      try {
        await this.close(record.session.sessionId, 'shutdown')
        closed.push(record.session.sessionId)
      } catch {
        // Continue bounded shutdown and expose failures through health diagnostics.
      }
    }
    return Object.freeze(closed)
  }

  snapshot(): readonly PortableBrowserManagedSessionSnapshot[] {
    return Object.freeze([...this.records.values()]
      .sort((a, b) => a.session.sessionId.localeCompare(b.session.sessionId))
      .map(record => Object.freeze({
        sessionId: record.session.sessionId,
        tenantId: record.tenantId,
        state: record.state,
        openedAt: record.openedAt,
        lastActivityAt: record.lastActivityAt,
        expiresAt: record.expiresAt,
        closeReason: record.closeReason,
        error: record.error,
      })))
  }

  health(): PortableBrowserLifecycleHealthSnapshot {
    const values = [...this.records.values()]
    const failedSessions = values.filter(record => record.state === 'failed').length
    const expiredSessions = values.filter(record => record.state === 'expired').length
    return Object.freeze({
      status: failedSessions > 0 ? 'degraded' : 'healthy',
      activeSessions: values.filter(record => record.state === 'active').length,
      trackedSessions: values.length,
      maximumConcurrentSessions: this.maximumConcurrentSessions,
      expiredSessions,
      failedSessions,
    })
  }

  private activeCount(): number {
    return [...this.records.values()].filter(record => record.state === 'active' || record.state === 'closing').length
  }

  private requireActive(sessionId: string): ManagedSessionRecord {
    const record = this.records.get(sessionId)
    if (!record) throw new Error('portable_browser_session_not_found')
    if (record.state !== 'active') throw new Error('portable_browser_session_not_active')
    return record
  }
}
