import { digestBrowserApprovalToken, verifyBrowserApprovalToken } from './approval.ts'
import {
  createBrowserExecutionId,
  fingerprintBrowserTask,
} from './execution-state.ts'
import type {
  BrowserAdapterContext,
  BrowserEvidence,
  BrowserSessionFactory,
  BrowserSessionPort,
  BrowserTask,
  BrowserTaskResult,
  BrowserTaskStep,
} from './contracts.ts'
import type {
  BrowserExecutionStore,
  BrowserSessionRegistry,
} from './execution-state.ts'
import {
  verifyBrowserTaskResult,
  verifyResumedBrowserTaskResult,
} from './verification.ts'

function normalizeOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Browser runtime protocol is not approved: ${url.protocol}`)
  }
  return url.origin
}

function assertAllowedOrigin(url: string, allowedOrigins: string[], context: string): string {
  const origin = normalizeOrigin(url)
  const approvedOrigins = allowedOrigins.map(normalizeOrigin)
  if (!approvedOrigins.includes(origin)) {
    throw new Error(`${context} origin is not approved: ${origin}`)
  }
  return url
}

function assertCurrentPageOrigin(
  pageUrl: string,
  allowedOrigins: string[],
  stepId: string,
  phase: 'before' | 'after',
): string {
  return assertAllowedOrigin(pageUrl, allowedOrigins, `Current page ${phase} step ${stepId}`)
}

function evidence(
  sequence: number,
  stepId: string,
  kind: BrowserEvidence['kind'],
  summary: string,
  extra: Partial<BrowserEvidence> = {},
): BrowserEvidence {
  return {
    sequence,
    timestamp: new Date().toISOString(),
    stepId,
    kind,
    summary,
    ...extra,
  }
}

function finalizeInitialResult(task: BrowserTask, result: BrowserTaskResult, now?: Date): BrowserTaskResult {
  return {
    ...result,
    verification: verifyBrowserTaskResult(task, result, now ?? new Date()),
  }
}

function finalizeResumedResult(
  task: BrowserTask,
  checkpointStepId: string,
  result: BrowserTaskResult,
  now?: Date,
): BrowserTaskResult {
  return {
    ...result,
    verification: verifyResumedBrowserTaskResult(task, result, checkpointStepId, now ?? new Date()),
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function executeStep(input: {
  step: BrowserTaskStep
  task: BrowserTask
  session: BrowserSessionPort
  context: BrowserAdapterContext
  events: BrowserEvidence[]
}): Promise<void> {
  const { step, task, session, context, events } = input

  if (step.kind === 'navigate') {
    assertAllowedOrigin(step.url, task.allowedOrigins, `Navigation target for step ${step.id}`)
    await session.page.goto(step.url)
    const currentUrl = assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'after')
    events.push(evidence(events.length + 1, step.id, 'navigation', 'Navigated to approved URL.', { url: currentUrl }))
  } else if (step.kind === 'click') {
    assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'before')
    await session.page.click(step.selector)
    const currentUrl = assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'after')
    events.push(evidence(events.length + 1, step.id, 'interaction', `Clicked approved selector ${step.selector}.`, { url: currentUrl }))
  } else if (step.kind === 'fill') {
    assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'before')
    const value = await context.resolveSecretRef(step.valueRef)
    assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'before')
    await session.page.fill(step.selector, value)
    const currentUrl = assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'after')
    events.push(evidence(events.length + 1, step.id, 'interaction', `Filled approved selector ${step.selector} from a secret reference.`, { url: currentUrl }))
  } else if (step.kind === 'wait_for') {
    assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'before')
    await session.page.waitForSelector(step.selector, step.timeoutMs)
    const currentUrl = assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'after')
    events.push(evidence(events.length + 1, step.id, 'interaction', `Observed approved selector ${step.selector}.`, { url: currentUrl }))
  } else if (step.kind === 'screenshot') {
    assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'before')
    const artifactRef = await context.captureScreenshot(step.label)
    const currentUrl = assertCurrentPageOrigin(session.page.url(), task.allowedOrigins, step.id, 'after')
    events.push(evidence(events.length + 1, step.id, 'screenshot', step.label, { artifactRef, url: currentUrl }))
  }
}

export async function runBrowserTask(input: {
  task: BrowserTask
  signingSecret: string
  sessions: BrowserSessionFactory
  context: BrowserAdapterContext
  now?: Date
  executionStore?: BrowserExecutionStore
  sessionRegistry?: BrowserSessionRegistry
}): Promise<BrowserTaskResult> {
  const { task, signingSecret, sessions, context } = input
  const startedAt = new Date().toISOString()
  const completedStepIds: string[] = []
  const events: BrowserEvidence[] = []
  let session: Awaited<ReturnType<BrowserSessionFactory['open']>> | null = null
  let keepSessionForResume = false

  try {
    if (Boolean(input.executionStore) !== Boolean(input.sessionRegistry)) {
      throw new Error('Resumable execution requires both an execution store and a session registry')
    }

    const checkpointIndex = task.steps.findIndex(step => step.kind === 'checkpoint')
    const hasResumableSteps = checkpointIndex >= 0 && checkpointIndex < task.steps.length - 1
    const resumableRequested = hasResumableSteps && Boolean(input.executionStore) && Boolean(input.sessionRegistry)
    const preApprovalStepIds = resumableRequested && checkpointIndex >= 0
      ? task.steps.slice(0, checkpointIndex + 1).map(step => step.id)
      : task.steps.map(step => step.id)
    const checkpointStep = checkpointIndex >= 0 ? task.steps[checkpointIndex] : undefined

    verifyBrowserApprovalToken(task.approvalToken, task, signingSecret, input.now, {
      expectedStepIds: preApprovalStepIds,
      expectedPhase: resumableRequested ? 1 : undefined,
      expectedCheckpointStepId: resumableRequested && checkpointStep?.kind === 'checkpoint'
        ? checkpointStep.id
        : undefined,
    })
    task.allowedOrigins.map(normalizeOrigin)
    session = await sessions.open(task)

    for (let index = 0; index < task.steps.length; index += 1) {
      const step = task.steps[index]
      if (step.kind === 'checkpoint') {
        events.push(evidence(events.length + 1, step.id, 'checkpoint', step.label))
        const pausedResult = finalizeInitialResult(task, {
          taskId: task.taskId,
          incidentId: task.incidentId,
          provider: task.provider,
          status: 'paused',
          startedAt,
          finishedAt: new Date().toISOString(),
          completedStepIds,
          pausedAtStepId: step.id,
          evidence: events,
          verification: 'pending',
        }, input.now)

        if (pausedResult.verification === 'pending' || pausedResult.verification.status !== 'verified') {
          return pausedResult
        }

        if (resumableRequested && input.executionStore && input.sessionRegistry) {
          const executionId = createBrowserExecutionId(task, step.id)
          const remainingSteps = task.steps.slice(index + 1)
          await input.executionStore.save({
            executionId,
            taskId: task.taskId,
            incidentId: task.incidentId,
            provider: task.provider,
            adapterId: task.adapterId,
            mode: task.mode,
            checkpointStepId: step.id,
            startedAt,
            completedStepIds: [...completedStepIds],
            remainingSteps,
            allowedOrigins: [...task.allowedOrigins],
            preApprovalTokenDigest: digestBrowserApprovalToken(task.approvalToken),
            taskFingerprint: fingerprintBrowserTask(task),
            evidence: [...events],
          })

          try {
            await input.sessionRegistry.retain(executionId, session)
            keepSessionForResume = true
          } catch (error) {
            await input.executionStore.delete(executionId).catch(() => undefined)
            throw error
          }

          return { ...pausedResult, executionId }
        }

        return pausedResult
      }

      await executeStep({ step, task, session, context, events })
      completedStepIds.push(step.id)
    }

    return finalizeInitialResult(task, {
      taskId: task.taskId,
      incidentId: task.incidentId,
      provider: task.provider,
      status: 'completed',
      startedAt,
      finishedAt: new Date().toISOString(),
      completedStepIds,
      evidence: events,
      verification: 'pending',
    }, input.now)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser runtime error'
    events.push(evidence(events.length + 1, 'runtime', 'error', message))
    return finalizeInitialResult(task, {
      taskId: task.taskId,
      incidentId: task.incidentId,
      provider: task.provider,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      completedStepIds,
      evidence: events,
      verification: 'pending',
      error: message,
    }, input.now)
  } finally {
    if (!keepSessionForResume) await session?.close().catch(() => undefined)
  }
}

export async function resumeBrowserTask(input: {
  task: BrowserTask
  executionId: string
  secondApprovalToken: string
  signingSecret: string
  executionStore: BrowserExecutionStore
  sessionRegistry: BrowserSessionRegistry
  context: BrowserAdapterContext
  now?: Date
}): Promise<BrowserTaskResult> {
  const record = await input.executionStore.load(input.executionId)
  const startedAt = record?.startedAt ?? new Date().toISOString()
  const completedStepIds = [...(record?.completedStepIds ?? [])]
  const events = [...(record?.evidence ?? [])]
  let checkpointStepId = record?.checkpointStepId ?? 'unknown-checkpoint'
  let session: BrowserSessionPort | null = null
  let recordValidated = false

  try {
    if (!record) throw new Error('Resumable browser execution record is missing')
    checkpointStepId = record.checkpointStepId

    const checkpointIndex = input.task.steps.findIndex(
      step => step.id === record.checkpointStepId && step.kind === 'checkpoint',
    )
    if (checkpointIndex < 0) throw new Error('Resumable checkpoint is missing from the task')

    const expectedCompletedStepIds = input.task.steps
      .slice(0, checkpointIndex)
      .map(step => step.id)
    const expectedRemainingSteps = input.task.steps.slice(checkpointIndex + 1)
    const expectedExecutionId = createBrowserExecutionId(input.task, record.checkpointStepId)
    const suppliedPreApprovalTokenDigest = digestBrowserApprovalToken(input.task.approvalToken)

    if (record.executionId !== input.executionId) throw new Error('Resumable record executionId mismatch')
    if (record.taskId !== input.task.taskId) throw new Error('Resumable taskId mismatch')
    if (record.incidentId !== input.task.incidentId) throw new Error('Resumable incidentId mismatch')
    if (record.provider !== input.task.provider) throw new Error('Resumable provider mismatch')
    if (record.adapterId !== input.task.adapterId) throw new Error('Resumable adapterId mismatch')
    if (record.mode !== input.task.mode) throw new Error('Resumable mode mismatch')
    if (record.taskFingerprint !== fingerprintBrowserTask(input.task)) {
      throw new Error('Resumable task fingerprint mismatch')
    }
    if (record.preApprovalTokenDigest !== suppliedPreApprovalTokenDigest) {
      throw new Error('Resumable pre-approval token mismatch')
    }
    if (expectedExecutionId !== input.executionId) {
      throw new Error('Resumable executionId does not match the task approval')
    }
    if (!sameJson(record.allowedOrigins, input.task.allowedOrigins)) {
      throw new Error('Resumable origin scope mismatch')
    }
    if (!sameJson(record.completedStepIds, expectedCompletedStepIds)) {
      throw new Error('Resumable completed step list mismatch')
    }
    if (!sameJson(record.remainingSteps, expectedRemainingSteps)) {
      throw new Error('Resumable remaining step list mismatch')
    }
    if (record.remainingSteps.length === 0) {
      throw new Error('Resumable execution has no remaining steps')
    }
    recordValidated = true

    verifyBrowserApprovalToken(
      input.secondApprovalToken,
      input.task,
      input.signingSecret,
      input.now,
      {
        expectedStepIds: record.remainingSteps.map(step => step.id),
        expectedPhase: 2,
        expectedCheckpointStepId: record.checkpointStepId,
        expectedExecutionId: input.executionId,
        expectedPreApprovalTokenDigest: record.preApprovalTokenDigest,
      },
    )

    session = await input.sessionRegistry.take(input.executionId)
    if (!session) throw new Error('Resumable browser session is missing or crashed')
    assertCurrentPageOrigin(session.page.url(), input.task.allowedOrigins, record.checkpointStepId, 'after')

    for (const step of record.remainingSteps) {
      await executeStep({ step, task: input.task, session, context: input.context, events })
      completedStepIds.push(step.id)
    }

    const result = finalizeResumedResult(input.task, record.checkpointStepId, {
      taskId: input.task.taskId,
      incidentId: input.task.incidentId,
      provider: input.task.provider,
      status: 'completed',
      startedAt,
      finishedAt: new Date().toISOString(),
      completedStepIds,
      executionId: input.executionId,
      evidence: events,
      verification: 'pending',
    }, input.now)

    if (result.verification === 'pending' || result.verification.status !== 'verified') {
      throw new Error('Resumed browser execution failed deterministic verification')
    }

    await session.close().catch(() => undefined)
    session = null
    await input.executionStore.delete(input.executionId)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser runtime error'
    events.push(evidence(events.length + 1, 'runtime', 'error', message))

    if (session) {
      await session.close().catch(() => undefined)
      session = null
      await input.executionStore.delete(input.executionId).catch(() => undefined)
    } else if (!recordValidated && record) {
      await input.sessionRegistry.discard(input.executionId).catch(() => undefined)
      await input.executionStore.delete(input.executionId).catch(() => undefined)
    } else if (recordValidated && /session is missing or crashed/.test(message)) {
      await input.executionStore.delete(input.executionId).catch(() => undefined)
    }

    return finalizeResumedResult(input.task, checkpointStepId, {
      taskId: input.task.taskId,
      incidentId: input.task.incidentId,
      provider: input.task.provider,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      completedStepIds,
      executionId: input.executionId,
      evidence: events,
      verification: 'pending',
      error: message,
    }, input.now)
  }
}
