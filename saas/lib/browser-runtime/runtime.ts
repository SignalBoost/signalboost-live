import { digestBrowserApprovalToken, verifyBrowserApprovalToken } from './approval.ts'
import { createBrowserExecutionId } from './execution-state.ts'
import { stableEvidenceHash, verifyBrowserEvidencePackage } from './verifier.ts'
import type {
  BrowserAdapterContext,
  BrowserEvidence,
  BrowserEvidencePackage,
  BrowserSessionFactory,
  BrowserSessionPort,
  BrowserTask,
  BrowserTaskResult,
  BrowserTaskStep,
  BrowserVerificationResult,
} from './contracts.ts'
import type { BrowserExecutionStore } from './execution-state.ts'

export const BROWSER_RUNTIME_VERSION = 'mission-001-resumable-v1'

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
  if (!approvedOrigins.includes(origin)) throw new Error(`${context} origin is not approved: ${origin}`)
  return url
}

function assertCurrentPageOrigin(pageUrl: string, allowedOrigins: string[], stepId: string, phase: 'before' | 'after'): string {
  return assertAllowedOrigin(pageUrl, allowedOrigins, `Current page ${phase} step ${stepId}`)
}

function evidence(sequence: number, stepId: string, kind: BrowserEvidence['kind'], summary: string, extra: Partial<BrowserEvidence> = {}): BrowserEvidence {
  return { sequence, timestamp: new Date().toISOString(), stepId, kind, summary, ...extra }
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

function buildEvidencePackage(input: {
  task: BrowserTask
  token: string
  startedAt: string
  completedAt: string
  events: BrowserEvidence[]
  finalUrl: string
}): BrowserEvidencePackage {
  const withoutHash = {
    taskId: input.task.taskId,
    incidentId: input.task.incidentId,
    provider: input.task.provider,
    adapterId: input.task.adapterId,
    approvalTokenDigest: digestBrowserApprovalToken(input.token),
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    orderedActionLog: input.events,
    screenshots: input.events.map(event => event.artifactRef).filter((value): value is string => Boolean(value)),
    finalUrl: input.finalUrl,
    browserRuntimeVersion: BROWSER_RUNTIME_VERSION,
  }
  return { ...withoutHash, evidenceHash: stableEvidenceHash(withoutHash) }
}

export async function runBrowserTask(input: {
  task: BrowserTask
  signingSecret: string
  sessions: BrowserSessionFactory
  context: BrowserAdapterContext
  now?: Date
  executionStore?: BrowserExecutionStore
}): Promise<BrowserTaskResult> {
  const { task, signingSecret, sessions, context } = input
  const startedAt = new Date().toISOString()
  const completedStepIds: string[] = []
  const events: BrowserEvidence[] = []
  let session: Awaited<ReturnType<BrowserSessionFactory['open']>> | null = null
  let keepSessionForResume = false

  try {
    verifyBrowserApprovalToken(task.approvalToken, task, signingSecret, input.now)
    task.allowedOrigins.map(normalizeOrigin)
    session = await sessions.open(task)

    for (let index = 0; index < task.steps.length; index += 1) {
      const step = task.steps[index]
      if (step.kind === 'checkpoint') {
        events.push(evidence(events.length + 1, step.id, 'checkpoint', step.label))
        const executionId = createBrowserExecutionId(task, step.id)
        const remainingSteps = task.steps.slice(index + 1)
        if (input.executionStore) {
          await input.executionStore.save({
            executionId,
            taskId: task.taskId,
            incidentId: task.incidentId,
            provider: task.provider,
            adapterId: task.adapterId,
            checkpointStepId: step.id,
            startedAt,
            completedStepIds: [...completedStepIds],
            remainingSteps,
            allowedOrigins: [...task.allowedOrigins],
            preApprovalTokenDigest: digestBrowserApprovalToken(task.approvalToken),
            evidence: [...events],
            session,
          })
          keepSessionForResume = true
        }
        return { taskId: task.taskId, incidentId: task.incidentId, provider: task.provider, status: 'paused', startedAt, finishedAt: new Date().toISOString(), completedStepIds, pausedAtStepId: step.id, executionId, evidence: events, verification: 'pending' }
      }
      await executeStep({ step, task, session, context, events })
      completedStepIds.push(step.id)
    }

    return { taskId: task.taskId, incidentId: task.incidentId, provider: task.provider, status: 'completed', startedAt, finishedAt: new Date().toISOString(), completedStepIds, evidence: events, verification: 'pending' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser runtime error'
    events.push(evidence(events.length + 1, 'runtime', 'error', message))
    return { taskId: task.taskId, incidentId: task.incidentId, provider: task.provider, status: 'failed', startedAt, finishedAt: new Date().toISOString(), completedStepIds, evidence: events, verification: 'pending', error: message }
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
  context: BrowserAdapterContext
  approvedValue: string
  successSelector: string
  savedValueSelector: string
  now?: Date
}): Promise<BrowserTaskResult> {
  const task = { ...input.task, approvalToken: input.secondApprovalToken }
  const completedStepIds: string[] = []
  let verification: 'pending' | BrowserVerificationResult = 'pending'
  const record = await input.executionStore.load(input.executionId)
  const startedAt = record?.startedAt ?? new Date().toISOString()
  const events = record ? [...record.evidence] : []

  try {
    if (!record) throw new Error('Resumable browser execution record is missing')
    if (!record.session) throw new Error('Resumable browser session is missing or crashed')
    if (record.taskId !== task.taskId) throw new Error('Resumable task_id mismatch')
    if (record.incidentId !== task.incidentId) throw new Error('Resumable incident_id mismatch')
    if (JSON.stringify(record.remainingSteps) !== JSON.stringify(task.steps)) throw new Error('Resumable remaining step list mismatch')
    if (record.remainingSteps.some(step => step.kind === 'fill' && !step.valueRef)) throw new Error('Resumable step is missing a secret reference')

    verifyBrowserApprovalToken(input.secondApprovalToken, task, input.signingSecret, input.now, record.remainingSteps.map(step => step.id))

    for (const step of record.remainingSteps) {
      await executeStep({ step, task, session: record.session, context: input.context, events })
      completedStepIds.push(step.id)
    }

    const completedAt = new Date().toISOString()
    const evidencePackage = buildEvidencePackage({ task, token: input.secondApprovalToken, startedAt, completedAt, events, finalUrl: record.session.page.url() })
    verification = await verifyBrowserEvidencePackage({ task, evidencePackage, page: record.session.page, successSelector: input.successSelector, savedValueSelector: input.savedValueSelector, approvedValue: input.approvedValue, now: input.now })
    if (!verification.ok) throw new Error(`Browser evidence verification failed: ${verification.errors.join('; ')}`)

    await record.session.close().catch(() => undefined)
    await input.executionStore.delete(input.executionId)
    return { taskId: task.taskId, incidentId: task.incidentId, provider: task.provider, status: 'completed', startedAt, finishedAt: completedAt, completedStepIds, executionId: input.executionId, evidence: events, evidencePackage, verification }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown browser runtime error'
    events.push(evidence(events.length + 1, 'runtime', 'error', message))
    return { taskId: task.taskId, incidentId: task.incidentId, provider: task.provider, status: 'failed', startedAt, finishedAt: new Date().toISOString(), completedStepIds, executionId: input.executionId, evidence: events, verification, error: message }
  }
}
