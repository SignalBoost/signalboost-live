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
  completedStepIds: string[]
  remainingSteps: BrowserTaskStep[]
  allowedOrigins: string[]
  preApprovalTokenDigest: string
  taskFingerprint: string
  evidence: BrowserEvidence[]
}

export interface BrowserExecutionStore {
  save(record: BrowserExecutionRecord): Promise<void>
  load(executionId: string): Promise<BrowserExecutionRecord | null>
  delete(executionId: string): Promise<void>
}

export interface BrowserSessionRegistry {
  retain(executionId: string, session: BrowserSessionPort): Promise<void>
  take(executionId: string): Promise<BrowserSessionPort | null>
  discard(executionId: string): Promise<void>
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

export class InMemoryBrowserExecutionStore implements BrowserExecutionStore {
  private readonly records = new Map<string, BrowserExecutionRecord>()

  async save(record: BrowserExecutionRecord): Promise<void> {
    this.records.set(record.executionId, structuredClone(record))
  }

  async load(executionId: string): Promise<BrowserExecutionRecord | null> {
    const record = this.records.get(executionId)
    return record ? structuredClone(record) : null
  }

  async delete(executionId: string): Promise<void> {
    this.records.delete(executionId)
  }
}

export class InMemoryBrowserSessionRegistry implements BrowserSessionRegistry {
  private readonly sessions = new Map<string, BrowserSessionPort>()

  async retain(executionId: string, session: BrowserSessionPort): Promise<void> {
    if (this.sessions.has(executionId)) {
      throw new Error(`Browser session already retained for execution ${executionId}`)
    }
    this.sessions.set(executionId, session)
  }

  async take(executionId: string): Promise<BrowserSessionPort | null> {
    const session = this.sessions.get(executionId) ?? null
    if (session) this.sessions.delete(executionId)
    return session
  }

  async discard(executionId: string): Promise<void> {
    const session = await this.take(executionId)
    await session?.close().catch(() => undefined)
  }
}
