import { createBrowserExecutionId } from './execution-state.ts'
import type {
  BrowserEvidence,
  BrowserTask,
  BrowserTaskResult,
  BrowserTaskStep,
  BrowserVerificationCheck,
  BrowserVerificationReport,
} from './contracts.ts'

const INVALID_VERIFICATION_TIMESTAMP = '1970-01-01T00:00:00.000Z'

function expectedEvidenceKind(step: BrowserTaskStep): BrowserEvidence['kind'] {
  if (step.kind === 'navigate') return 'navigation'
  if (step.kind === 'screenshot') return 'screenshot'
  if (step.kind === 'checkpoint') return 'checkpoint'
  return 'interaction'
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function isApprovedEvidenceUrl(url: string | undefined, allowedOrigins: string[]): boolean {
  if (!url) return false
  const origin = normalizeOrigin(url)
  if (!origin) return false
  return allowedOrigins.map(normalizeOrigin).includes(origin)
}

function sameOrderedValues(left: string[], right: string[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function resolveVerificationClock(now: Date): { valid: boolean; verifiedAt: string } {
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs)) {
    return {
      valid: false,
      verifiedAt: INVALID_VERIFICATION_TIMESTAMP,
    }
  }

  return {
    valid: true,
    verifiedAt: new Date(nowMs).toISOString(),
  }
}

interface VerificationShape {
  checkpointRulePassed: boolean
  checkpointRuleSummary: string
  executionIdRulePassed: boolean
  executionIdRuleSummary: string
  expectedStatus: BrowserTaskResult['status']
  expectedCompletedSteps: BrowserTaskStep[]
  expectedEvidenceSteps: BrowserTaskStep[]
  expectedPausedStepId?: string
}

function verifyAgainstShape(
  task: BrowserTask,
  result: BrowserTaskResult,
  shape: VerificationShape,
  now: Date,
): BrowserVerificationReport {
  const checks: BrowserVerificationCheck[] = []
  const verificationClock = resolveVerificationClock(now)

  function check(id: string, passed: boolean, summary: string): void {
    checks.push({ id, passed, summary })
  }

  check(
    'verification-clock',
    verificationClock.valid,
    'Verification clock is a valid timestamp.',
  )
  check('task-id', result.taskId === task.taskId, 'Result task ID matches the approved task.')
  check('incident-id', result.incidentId === task.incidentId, 'Result incident ID matches the approved task.')
  check('provider', result.provider === task.provider, 'Result provider matches the approved task.')
  check('checkpoint-shape', shape.checkpointRulePassed, shape.checkpointRuleSummary)
  check('execution-id', shape.executionIdRulePassed, shape.executionIdRuleSummary)
  check('terminal-status', result.status === shape.expectedStatus, `Result terminates as ${shape.expectedStatus}.`)
  check(
    'completed-steps',
    sameOrderedValues(result.completedStepIds, shape.expectedCompletedSteps.map(step => step.id)),
    'Completed step IDs exactly match the bounded execution sequence.',
  )
  check(
    'paused-step',
    result.pausedAtStepId === shape.expectedPausedStepId,
    'Paused step matches the approved checkpoint boundary.',
  )
  check(
    'evidence-sequence',
    result.evidence.every((event, index) => event.sequence === index + 1),
    'Evidence sequence is contiguous and ordered.',
  )
  check(
    'no-error-evidence',
    result.evidence.every(event => event.kind !== 'error'),
    'Evidence contains no runtime error event.',
  )

  const expectedEvidenceStepIds = shape.expectedEvidenceSteps.map(step => step.id)
  const actualEvidenceStepIds = result.evidence.map(event => event.stepId)
  check(
    'evidence-step-set',
    sameOrderedValues(actualEvidenceStepIds, expectedEvidenceStepIds),
    'Evidence maps exactly to each executed step and checkpoint.',
  )

  for (const step of shape.expectedEvidenceSteps) {
    const matchingEvents = result.evidence.filter(event => event.stepId === step.id)
    const event = matchingEvents[0]

    check(
      `evidence-count:${step.id}`,
      matchingEvents.length === 1,
      `Step ${step.id} has exactly one evidence event.`,
    )
    check(
      `evidence-kind:${step.id}`,
      event?.kind === expectedEvidenceKind(step),
      `Step ${step.id} has the expected evidence kind.`,
    )

    if (step.kind === 'checkpoint') {
      check(
        `checkpoint-label:${step.id}`,
        event?.summary === step.label,
        `Checkpoint ${step.id} preserves its approved label.`,
      )
      continue
    }

    check(
      `evidence-origin:${step.id}`,
      isApprovedEvidenceUrl(event?.url, task.allowedOrigins),
      `Step ${step.id} evidence remains on an approved origin.`,
    )

    if (step.kind === 'screenshot') {
      check(
        `screenshot-label:${step.id}`,
        event?.summary === step.label,
        `Screenshot ${step.id} preserves its approved label.`,
      )
      check(
        `screenshot-artifact:${step.id}`,
        Boolean(event?.artifactRef?.trim()),
        `Screenshot ${step.id} includes a non-empty artifact reference.`,
      )
    }
  }

  const errors = checks.filter(item => !item.passed).map(item => item.summary)
  return {
    taskId: task.taskId,
    incidentId: task.incidentId,
    provider: task.provider,
    status: errors.length === 0 ? 'verified' : 'failed',
    verifiedAt: verificationClock.verifiedAt,
    checks,
    errors,
  }
}

export function verifyBrowserTaskResult(
  task: BrowserTask,
  result: BrowserTaskResult,
  now = new Date(),
  requiredExecutionId?: string,
): BrowserVerificationReport {
  const executionExpectationWasProvided = arguments.length >= 4
  const checkpoints = task.steps.filter(step => step.kind === 'checkpoint')
  const checkpointIndex = task.steps.findIndex(step => step.kind === 'checkpoint')
  const expectedCheckpoint = checkpointIndex >= 0 ? task.steps[checkpointIndex] : undefined
  const expectedCompletedSteps = checkpointIndex >= 0
    ? task.steps.slice(0, checkpointIndex)
    : task.steps
  const expectedEvidenceSteps = expectedCheckpoint?.kind === 'checkpoint'
    ? [...expectedCompletedSteps, expectedCheckpoint]
    : expectedCompletedSteps
  const expectedExecutionId = expectedCheckpoint?.kind === 'checkpoint'
    ? createBrowserExecutionId(task, expectedCheckpoint.id)
    : undefined

  let executionIdRulePassed: boolean
  let executionIdRuleSummary: string

  if (expectedExecutionId === undefined) {
    executionIdRulePassed = requiredExecutionId === undefined && result.executionId === undefined
    executionIdRuleSummary = 'Result has no continuation execution ID when the task has no checkpoint.'
  } else if (executionExpectationWasProvided && requiredExecutionId === undefined) {
    executionIdRulePassed = result.executionId === undefined
    executionIdRuleSummary = 'Explicitly non-resumable checkpoint result has no continuation execution ID.'
  } else {
    const exactExecutionId = requiredExecutionId ?? expectedExecutionId
    executionIdRulePassed = exactExecutionId === expectedExecutionId
      && result.executionId === exactExecutionId
    executionIdRuleSummary = 'Result execution ID exactly matches the approved checkpoint identity.'
  }

  return verifyAgainstShape(task, result, {
    checkpointRulePassed: checkpoints.length <= 1,
    checkpointRuleSummary: 'Task contains at most one approval checkpoint.',
    executionIdRulePassed,
    executionIdRuleSummary,
    expectedStatus: checkpointIndex >= 0 ? 'paused' : 'completed',
    expectedCompletedSteps,
    expectedEvidenceSteps,
    expectedPausedStepId: expectedCheckpoint?.kind === 'checkpoint' ? expectedCheckpoint.id : undefined,
  }, now)
}

export function verifyResumedBrowserTaskResult(
  task: BrowserTask,
  result: BrowserTaskResult,
  checkpointStepId: string,
  now = new Date(),
): BrowserVerificationReport {
  const checkpoints = task.steps.filter(step => step.kind === 'checkpoint')
  const checkpointIndex = task.steps.findIndex(step => step.id === checkpointStepId && step.kind === 'checkpoint')
  const expectedExecutionId = checkpointIndex >= 0
    ? createBrowserExecutionId(task, checkpointStepId)
    : undefined

  return verifyAgainstShape(task, result, {
    checkpointRulePassed: checkpoints.length === 1 && checkpointIndex >= 0,
    checkpointRuleSummary: 'Resumed task contains exactly the approved checkpoint.',
    executionIdRulePassed: expectedExecutionId !== undefined && result.executionId === expectedExecutionId,
    executionIdRuleSummary: 'Resumed result execution ID exactly matches the approved checkpoint identity.',
    expectedStatus: 'completed',
    expectedCompletedSteps: task.steps.filter(step => step.kind !== 'checkpoint'),
    expectedEvidenceSteps: task.steps,
    expectedPausedStepId: undefined,
  }, now)
}
