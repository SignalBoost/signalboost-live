import type { BrowserTask, BrowserTaskStep } from './contracts.ts'

function cloneStep(step: BrowserTaskStep): BrowserTaskStep {
  return Object.freeze({ ...step }) as BrowserTaskStep
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
    allowedOrigins: Object.freeze([...task.allowedOrigins]) as string[],
    steps: Object.freeze(task.steps.map(cloneStep)) as BrowserTaskStep[],
    approvalToken: task.approvalToken,
  }

  return Object.freeze(snapshot) as BrowserTask
}
