import type { BrowserTask, BrowserTaskStep } from './contracts.ts'

function cloneStep(step: BrowserTaskStep): BrowserTaskStep {
  const snapshot = { ...step } as BrowserTaskStep
  Object.freeze(snapshot)
  return snapshot
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
  const allowedOrigins = [...task.allowedOrigins]
  const steps = task.steps.map(cloneStep)
  Object.freeze(allowedOrigins)
  Object.freeze(steps)

  const snapshot: BrowserTask = {
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    adapterId: task.adapterId,
    mode: task.mode,
    issuedAt: task.issuedAt,
    expiresAt: task.expiresAt,
    allowedOrigins,
    steps,
    approvalToken: task.approvalToken,
  }

  Object.freeze(snapshot)
  return snapshot
}
