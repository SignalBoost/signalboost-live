import { createHash } from 'crypto'
import type {
  BrowserEvidence,
  BrowserSessionPort,
  BrowserTask,
  BrowserTaskMode,
  BrowserTaskStep,
} from './contracts.ts'
import { digestBrowserApprovalToken } from './approval.ts'

export interface BrowserExecutionRecord {
  executionId: string
  taskId: string
  incidentId: string
  provider: string
  adapterId: string
  mode: BrowserTaskMode
  checkpointStepId: string
  startedAt: string
  expiresAt: string
  completedStepIds: string[]
  remainingSteps: BrowserTaskStep[]
  allowedOrigins: string[]
  preApprovalTokenDigest: string
  taskFingerprint: string
  evidence: BrowserEvidence[]
}

export interface BrowserExecutionStore {
  save(record: BrowserExecutionRecord, retainedAt?: Date): Promise<void>
  load(executionId: string): Promise<BrowserExecutionRecord | null>
  delete(executionId: string): Promise<void>
}

export interface BrowserSessionRegistry {
  retain(
    executionId: string,
    session: BrowserSessionPort,
    expiresAt: string,
    retainedAt?: Date,
  ): Promise<void>
  take(executionId: string): Promise<BrowserSessionPort | null>
  discard(executionId: string): Promise<void>
}

export interface BrowserExpiryHandle {
  cancel(): void
}

export interface BrowserExpiryScheduler {
  schedule(callback: () => void, delayMs: number): BrowserExpiryHandle
}

export interface InMemoryBrowserStateOptions {
  scheduler?: BrowserExpiryScheduler
}

const MAX_TIMER_DELAY_MS = 2_147_483_647

const defaultExpiryScheduler: BrowserExpiryScheduler = {
  schedule(callback, delayMs) {
    let cancelled = false
    let remainingMs = delayMs
    let timer: ReturnType<typeof setTimeout> | null = null

    const arm = (): void => {
      const currentDelayMs = Math.min(remainingMs, MAX_TIMER_DELAY_MS)
      timer = setTimeout(() => {
        if (cancelled) return
        remainingMs -= currentDelayMs
        if (remainingMs > 0) {
          arm()
          return
        }
        callback()
      }, currentDelayMs)
      timer.unref?.()
    }

    arm()

    return {
      cancel() {
        cancelled = true
        if (timer) clearTimeout(timer)
      },
    }
  },
}

function parseExpiry(expiresAt: string): number {
  const expiryMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiryMs)) {
    throw new Error('Browser continuation expiry must be a valid timestamp')
  }
  return expiryMs
}

function retentionDelay(expiresAt: string, retainedAt: Date): number {
  const retainedAtMs = retainedAt.getTime()
  if (!Number.isFinite(retainedAtMs)) {
    throw new Error('Browser continuation retention time must be valid')
  }

  const delayMs = parseExpiry(expiresAt) - retainedAtMs
  if (delayMs <= 0) {
    throw new Error('Browser continuation is already expired')
  }
  return delayMs
}

function stableTaskPayload(task: BrowserTask): string {
  return JSON.stringify({
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    allowedOrigins: task.allowedOrigins,
    steps: task.steps,
  })
}

export function fingerprintBrowserTask(task: BrowserTask): string {
  return createHash('sha256').update(stableTaskPayload(task)).digest('hex')
}

export function createBrowserExecutionId(task: BrowserTask, checkpointStepId: string): string {
  const material = [
    fingerprintBrowserTask(task),
    checkpointStepId,
    digestBrowserApprovalToken(task.approvalToken),
  ].join(':')
  return createHash('sha256').update(material).digest('hex')
}

interface StoredExecution {
  record: BrowserExecutionRecord
  expiry: BrowserExpiryHandle
}

function pendingExpiryHandle(): BrowserExpiryHandle {
  return { cancel() {} }
}

export class InMemoryBrowserExecutionStore implements BrowserExecutionStore {
  private readonly records = new Map<string, StoredExecution>()
  private readonly scheduler: BrowserExpiryScheduler

  constructor(options: InMemoryBrowserStateOptions = {}) {
    this.scheduler = options.scheduler ?? defaultExpiryScheduler
  }

  async save(record: BrowserExecutionRecord, retainedAt = new Date()): Promise<void> {
    const delayMs = retentionDelay(record.expiresAt, retainedAt)
    const snapshot = structuredClone(record)
    const existing = this.records.get(record.executionId)
    existing?.expiry.cancel()

    const stored: StoredExecution = {
      record: snapshot,
      expiry: pendingExpiryHandle(),
    }
    this.records.set(record.executionId, stored)

    try {
      stored.expiry = this.scheduler.schedule(() => {
        if (this.records.get(record.executionId) === stored) {
          this.records.delete(record.executionId)
        }
      }, delayMs)
    } catch (error) {
      if (this.records.get(record.executionId) === stored) {
        this.records.delete(record.executionId)
      }
      throw error
    }
  }

  async load(executionId: string): Promise<BrowserExecutionRecord | null> {
    const stored = this.records.get(executionId)
    return stored ? structuredClone(stored.record) : null
  }

  async delete(executionId: string): Promise<void> {
    const stored = this.records.get(executionId)
    if (!stored) return
    this.records.delete(executionId)
    stored.expiry.cancel()
  }
}

interface RetainedSession {
  session: BrowserSessionPort
  expiry: BrowserExpiryHandle
}

export class InMemoryBrowserSessionRegistry implements BrowserSessionRegistry {
  private readonly sessions = new Map<string, RetainedSession>()
  private readonly scheduler: BrowserExpiryScheduler

  constructor(options: InMemoryBrowserStateOptions = {}) {
    this.scheduler = options.scheduler ?? defaultExpiryScheduler
  }

  async retain(
    executionId: string,
    session: BrowserSessionPort,
    expiresAt: string,
    retainedAt = new Date(),
  ): Promise<void> {
    if (this.sessions.has(executionId)) {
      throw new Error(`Browser session already retained for execution ${executionId}`)
    }

    let delayMs: number
    try {
      delayMs = retentionDelay(expiresAt, retainedAt)
    } catch (error) {
      await session.close().catch(() => undefined)
      throw error
    }

    const retained: RetainedSession = {
      session,
      expiry: pendingExpiryHandle(),
    }
    this.sessions.set(executionId, retained)

    try {
      retained.expiry = this.scheduler.schedule(() => {
        if (this.sessions.get(executionId) !== retained) return
        this.sessions.delete(executionId)
        void session.close().catch(() => undefined)
      }, delayMs)
    } catch (error) {
      if (this.sessions.get(executionId) === retained) {
        this.sessions.delete(executionId)
      }
      await session.close().catch(() => undefined)
      throw error
    }
  }

  async take(executionId: string): Promise<BrowserSessionPort | null> {
    const retained = this.sessions.get(executionId)
    if (!retained) return null
    this.sessions.delete(executionId)
    retained.expiry.cancel()
    return retained.session
  }

  async discard(executionId: string): Promise<void> {
    const session = await this.take(executionId)
    await session?.close().catch(() => undefined)
  }
}
