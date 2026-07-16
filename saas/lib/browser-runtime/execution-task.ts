import type {
  BrowserEvidence,
  BrowserTask,
  BrowserTaskStep,
} from './contracts.ts'
import type { BrowserExecutionRecord } from './execution-state.ts'

function freezeCopy<T extends object>(value: T): T {
  const snapshot = { ...value }
  Object.freeze(snapshot)
  return snapshot as T
}

function cloneStep(step: BrowserTaskStep): BrowserTaskStep {
  return freezeCopy(step)
}

function cloneEvidence(item: BrowserEvidence): BrowserEvidence {
  return freezeCopy(item)
}

function freezeArray<T>(values: T[]): T[] {
  Object.freeze(values)
  return values
}

/**
 * Creates the exact task object used after approval verification.
 *
 * The snapshot contains only executable, approval-bound fields. Optional task
 * metadata is intentionally excluded because it is audit context and must not
 * influence browser launch or execution behavior. The returned object is
 * deeply frozen across the executable step and origin collections so injected
 * ports cannot change approved scope after verification.
 */
export function createBrowserExecutionTaskSnapshot(task: BrowserTask): BrowserTask {
  const snapshot: BrowserTask = {
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    allowedOrigins: freezeArray([...task.allowedOrigins]),
    steps: freezeArray(task.steps.map(cloneStep)),
    approvalToken: task.approvalToken,
  }

  Object.freeze(snapshot)
  return snapshot
}

/**
 * Detaches resumable execution from the object returned by an injected store.
 * A store may retain its own reference, so all execution-significant arrays and
 * objects are copied and frozen before the next asynchronous boundary.
 */
export function createBrowserExecutionRecordSnapshot(
  record: BrowserExecutionRecord,
): BrowserExecutionRecord {
  const snapshot: BrowserExecutionRecord = {
    executionId: record.executionId,
    taskId: record.taskId,
    incidentId: record.incidentId,
    provider: record.provider,
    adapterId: record.adapterId,
    mode: record.mode,
    checkpointStepId: record.checkpointStepId,
    startedAt: record.startedAt,
    expiresAt: record.expiresAt,
    completedStepIds: freezeArray([...record.completedStepIds]),
    remainingSteps: freezeArray(record.remainingSteps.map(cloneStep)),
    allowedOrigins: freezeArray([...record.allowedOrigins]),
    preApprovalTokenDigest: record.preApprovalTokenDigest,
    taskFingerprint: record.taskFingerprint,
    evidence: freezeArray(record.evidence.map(cloneEvidence)),
  }

  Object.freeze(snapshot)
  return snapshot
}
