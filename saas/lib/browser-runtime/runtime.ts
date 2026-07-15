import { verifyBrowserApprovalToken } from './approval.ts'
import type {
  BrowserAdapterContext,
  BrowserEvidence,
  BrowserSessionFactory,
  BrowserTask,
  BrowserTaskResult,
} from './contracts.ts'

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
    task.allowedOrigins.map(normalizeOrigin)
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
