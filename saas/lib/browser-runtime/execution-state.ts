import type { BrowserEvidence, BrowserSessionPort, BrowserTask, BrowserTaskStep } from './contracts.ts'

export interface BrowserExecutionRecord {
  executionId: string
  taskId: string
  incidentId: string
  provider: string
  adapterId: string
  checkpointStepId: string
  startedAt: string
  completedStepIds: string[]
  remainingSteps: BrowserTaskStep[]
  allowedOrigins: string[]
  preApprovalTokenDigest: string
  evidence: BrowserEvidence[]
  session?: BrowserSessionPort
}

export interface BrowserExecutionStore {
  save(record: BrowserExecutionRecord): Promise<void>
  load(executionId: string): Promise<BrowserExecutionRecord | null>
  delete(executionId: string): Promise<void>
}

export class InMemoryBrowserExecutionStore implements BrowserExecutionStore {
  private readonly records = new Map<string, BrowserExecutionRecord>()

  async save(record: BrowserExecutionRecord): Promise<void> {
    this.records.set(record.executionId, record)
  }

  async load(executionId: string): Promise<BrowserExecutionRecord | null> {
    return this.records.get(executionId) ?? null
  }

  async delete(executionId: string): Promise<void> {
    this.records.delete(executionId)
  }
}

export function createBrowserExecutionId(task: Pick<BrowserTask, 'taskId' | 'incidentId'>, checkpointStepId: string): string {
  return `${task.taskId}:${task.incidentId}:${checkpointStepId}`
}
