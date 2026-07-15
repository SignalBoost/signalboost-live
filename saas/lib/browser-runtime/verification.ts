import type {
  BrowserEvidence,
  BrowserTask,
  BrowserTaskResult,
  BrowserTaskStep,
  BrowserVerificationCheck,
  BrowserVerificationReport,
} from './contracts.ts'

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

export function verifyBrowserTaskResult(
  task: BrowserTask,
  result: BrowserTaskResult,
  now = new Date(),
): BrowserVerificationReport {
  const checks: BrowserVerificationCheck[] = []

  function check(id: string, passed: boolean, summary: string): void {
    checks.push({ id, passed, summary })
  }

  check('task-id', result.taskId === task.taskId, 'Result task ID matches the approved task.')
  check('incident-id', result.incidentId === task.incidentId, 'Result incident ID matches the approved task.')
  check('provider', result.provider === task.provider, 'Result provider matches the approved task.')

  const checkpoints = task.steps.filter(step => step.kind === 'checkpoint')
  check('single-checkpoint', checkpoints.length <= 1, 'Task contains at most one approval checkpoint.')

  const checkpointIndex = task.steps.findIndex(step => step.kind === 'checkpoint')
  const expectedStatus = checkpointIndex >= 0 ? 'paused' : 'completed'
  const expectedCompletedSteps = checkpointIndex >= 0
    ? task.steps.slice(0, checkpointIndex)
    : task.steps
  const expectedCompletedStepIds = expectedCompletedSteps.map(step => step.id)

  check('terminal-status', result.status === expectedStatus, `Result terminates as ${expectedStatus}.`)
  check(
    'completed-steps',
    sameOrderedValues(result.completedStepIds, expectedCompletedStepIds),
    'Completed step IDs exactly match the bounded execution sequence.',
  )

  const expectedCheckpoint = checkpointIndex >= 0 ? task.steps[checkpointIndex] : undefined
  check(
    'paused-step',
    expectedCheckpoint?.kind === 'checkpoint'
      ? result.pausedAtStepId === expectedCheckpoint.id
      : result.pausedAtStepId === undefined,
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

  const expectedEvidenceSteps = expectedCheckpoint?.kind === 'checkpoint'
    ? [...expectedCompletedSteps, expectedCheckpoint]
    : expectedCompletedSteps
  const expectedEvidenceStepIds = expectedEvidenceSteps.map(step => step.id)
  const actualEvidenceStepIds = result.evidence.map(event => event.stepId)

  check(
    'evidence-step-set',
    sameOrderedValues(actualEvidenceStepIds, expectedEvidenceStepIds),
    'Evidence maps exactly to each executed step and checkpoint.',
  )

  for (const step of expectedEvidenceSteps) {
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
    verifiedAt: now.toISOString(),
    checks,
    errors,
  }
}
