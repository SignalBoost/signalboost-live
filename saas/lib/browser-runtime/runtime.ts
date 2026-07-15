import { verifyBrowserApprovalToken } from './approval.ts'
import type {
  BrowserAdapterContext,
  BrowserEvidence,
  BrowserSessionFactory,
  BrowserTask,
  BrowserTaskResult,
} from './contracts.ts'

function assertAllowedOrigin(url: string, allowedOrigins: string[]): void {
  const origin = new URL(url).origin
  if (!allowedOrigins.includes(origin)) {
    throw new Error(`Navigation origin is not approved: ${origin}`)
  }
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

export async function runBrowserTask(input: {
  task: BrowserTask
  signingSecret: string
  sessions: BrowserSessionFactory
  context: BrowserAdapterContext
  now?: Date
}): Promise<BrowserTaskResult> {
  const { task, signingSecret, sessions, context } = input
  const startedAt = new Date().toISOString()
  const completedStepIds: string[] = []
  const events: BrowserEvidence[] = []
  let session: Awaited<ReturnType<BrowserSessionFactory['open']>> | null = null

  try {
    verifyBrowserApprovalToken(task.approvalToken, task, signingSecret, input.now)
    session = await sessions.open(task)

    for (const step of task.steps) {
      if (step.kind === 'checkpoint') {
        events.push(evidence(events.length + 1, step.id, 'checkpoint', step.label))
        return {
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
        }
      }

      if (step.kind === 'navigate') {
        assertAllowedOrigin(step.url, task.allowedOrigins)
        await session.page.goto(step.url)
        events.push(evidence(events.length + 1, step.id, 'navigation', 'Navigated to approved URL.', { url: step.url }))
      } else if (step.kind === 'click') {
        await session.page.click(step.selector)
        events.push(evidence(events.length + 1, step.id, 'interaction', `Clicked approved selector ${step.selector}.`, { url: session.page.url() }))
      } else if (step.kind === 'fill') {
        const value = await context.resolveSecretRef(step.valueRef)
        await session.page.fill(step.selector, value)
        events.push(evidence(events.length + 1, step.id, 'interaction', `Filled approved selector ${step.selector} from a secret reference.`, { url: session.page.url() }))
      } else if (step.kind === 'wait_for') {
        await session.page.waitForSelector(step.selector, step.timeoutMs)
        events.push(evidence(events.length + 1, step.id, 'interaction', `Observed approved selector ${step.selector}.`, { url: session.page.url() }))
      } else if (step.kind === 'screenshot') {
        const artifactRef = await context.captureScreenshot(step.label)
        events.push(evidence(events.length + 1, step.id, 'screenshot', step.label, { artifactRef, url: session.page.url() }))
      }

      completedStepIds.push(step.id)
    }

    return {
      taskId: task.taskId,
      incidentId: task.incidentId,
      provider: task.provider,
      status: 'completed',
      startedAt,
      finishedAt: new Date().toISOString(),
      completedStepIds,
      evidence: events,
      verification: 'pending',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser runtime error'
    events.push(evidence(events.length + 1, 'runtime', 'error', message))
    return {
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
    }
  } finally {
    await session?.close().catch(() => undefined)
  }
}