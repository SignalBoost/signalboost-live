import { CAMPAIGN_ENGINE, CAMPAIGN_TOTAL_DEADLINE_MS, runCampaignJobSlice, type CampaignSliceOutcome } from './campaign/job.ts'
import { createCampaignHostPorts } from './campaign/hostPorts.ts'
import { builderAcceptanceReport } from './acceptance-report.ts'
import { builderFinalProof } from './final-proof.ts'
import { builderAcceptanceLedger } from './acceptance-ledger.ts'
import type { BuilderLoopCheckpoint } from './checkpoint.ts'
import { publishVerifiedIsolatedProject, mergeVerifiedIsolatedPullRequest, verifyIsolatedPreview, isolatedDeploymentFiles, wantsIsolatedPublication } from './isolated-publication.ts'
import { withHostProductionHarnessIngress } from '../../platform-harness/runtime/host-ingress.ts'
import { builderRunSourceEvidence } from './source-evidence.ts'
import { builderPendingWriteEvidence } from './evidence-events.ts'
// lib/builder/job-runner.ts
import { createBuilderCodingAiPort } from '../cos/aiPort.ts'
import { readBuilderRunLimits, withBuilderInferenceBudget, withBuilderInferenceJob } from './inference-budget.ts'
import { builderInferenceBudgetSummary, createBuilderInferenceBudgetStore, readBuilderInferenceBudgetReceipt } from './inference-budget-store.ts'
import { BUILDER_TURN_TIMEOUT_ERROR, createGovernedBuilderAiPort } from './control-adapter.ts'
import type { BuilderToolTrace } from './contracts.ts'
import { finishBuilderJob, claimBuilderJob, deferBuilderJobForCapacity, readBuilderWorkspaceFingerprint, getBuilderJobForUser, peekBuilderJob, type BuilderJobRecord } from './job-store.ts'
import { MAX_WORK_SLICES, builderJobOverTotalDeadline, BUILDER_JOB_TOTAL_DEADLINE_MS, BUILDER_SLICE_MAX_STEPS } from './work-budget.ts'
import { formatBuilderOperatorRepairReply } from './operator-narration.ts'
import { builderNextAction } from './user-guidance.ts'
import { isRepairObjective } from './regression-gate.ts'
import { formatBuilderExecutionEvidence } from './execution-evidence.ts'
import { BuilderV2Agent, builderV2ProgressReport, builderV2IdleSliceCount, type BuilderV2Checkpoint } from './agent-v2.ts'
import { BuilderV2Dispatcher } from './agent-v2-dispatcher.ts'
import { runBuilderV2JobCycle } from './agent-v2-job-cycle.ts'
import { createBuilderV2SupabaseLeaseStore } from './agent-v2-supabase-store.ts'
import { createBuilderPlaywrightCliPort } from './playwright-cli-port.ts'
import { VercelSandboxBuilderRunner } from './vercel-sandbox-runner.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'
import { executeSignalBoostRepositoryRepair } from './repository-repair.ts'
import { isRepositoryRepairCheckpoint } from './repository-repair-v2.ts'
import { parseSignalBoostRepositoryRepairTarget, signalBoostDeployedRepairTarget } from './repository-repair-target.ts'
import { builderAutoMergeSnapshotPort } from './repository-repair-snapshot-host.ts'
import { deepInfraMaxRunUsd } from '../ai/cos/deepInfraSpendPolicy.ts'
import { runWithoutTurnDeadline } from '../ai/cos/cosTurnBudget.ts'
import { recordBuilderCompetencyGap } from './competency-gap.ts'
import { getAdminSupabase } from '@/utils/supabase/server'
import { assistanceCopy, BUILDER_RESULT_CONTINUING, BUILDER_RESULT_DONE, BUILDER_RESULT_NOT_FINISHED, BUILDER_RESULT_STALLED, BUILDER_RESULT_SYNTAX_ONLY, COLLABORATE_PUBLICATION_PAUSED, COLLABORATE_SOURCE_CHANGED } from '../ai/cos/assistanceMode.ts'
import { markActiveSpanFailed, withSpan, withTraceparent } from '../observability/tracing.ts'

const BUILDER_SLICE_HARD_DEADLINE_MS = 240_000
const SELF_HEALING_REPOSITORY_BUDGET_MS = 285_000
const MAX_SELF_HEALING_EXECUTION_TIMEOUT_DEFERRALS = 3
const MAX_STANDARD_CAPACITY_DEFERRALS = 3

export function selfHealingCapacityJob(job: BuilderJobRecord): boolean {
  return job.ownerAuthorized && (
    job.metadata.selfHealingUniversityDistillation === true
    || job.metadata.selfHealingOwnedSite === true
    || job.metadata.selfHealingOwnedAudit === true
    || job.metadata.selfHealingProductionRecovery === true
  )
}

type SelfHealingDeferralReason = 'builder_runpod_primary_busy' | 'builder_turn_timeout' | 'builder_model_round_timeout'

function metadataCount(job: BuilderJobRecord, key: string): number {
  const value = Number(job.metadata[key])
  return Number.isInteger(value) && value >= 0 ? value : 0
}

function capacityDeferrable(job: BuilderJobRecord, error: string | null): error is SelfHealingDeferralReason {
  if (error === 'builder_runpod_primary_busy') return true
  if (error !== BUILDER_TURN_TIMEOUT_ERROR && error !== 'builder_model_round_timeout') return false
  return metadataCount(job, 'builderExecutionTimeoutDeferrals') < MAX_SELF_HEALING_EXECUTION_TIMEOUT_DEFERRALS
}

async function deferSelfHealingCapacity(job: BuilderJobRecord, error: string | null, trace: readonly unknown[], checkpoint: BuilderLoopCheckpoint | null = null): Promise<boolean> {
  const standardBusy = job.jobKind === 'standard' && (error === 'builder_runpod_primary_busy' || error === 'builder_model_round_timeout' || error === BUILDER_TURN_TIMEOUT_ERROR)
    && metadataCount(job, 'builderCapacityDeferrals') < MAX_STANDARD_CAPACITY_DEFERRALS
  if (!standardBusy && (!selfHealingCapacityJob(job) || !capacityDeferrable(job, error))) return false
  const deferred = await deferBuilderJobForCapacity({ job, reason: error, checkpoint })
  if (deferred) {
    console.info('[builder_self_healing_capacity_deferred]', {
      jobId: job.id,
      claimGeneration: job.claimGeneration,
      reason: error,
      productiveTraceSteps: trace.length,
      executionTimeoutDeferrals: metadataCount(job, 'builderExecutionTimeoutDeferrals')
        + (error === 'builder_runpod_primary_busy' ? 0 : 1),
    })
  }
  return deferred
}

function publicTrace(trace: readonly BuilderToolTrace[]) {
  return trace.map(({ round, toolId, ok, input, output, error, failureClass, remediation }) => {
    const base = {
      round,
      toolId,
      ok,
      ...(error ? { error } : {}),
      ...(failureClass ? { failureClass } : {}),
      ...(remediation ? { remediation } : {}),
    }
    if (toolId !== 'run') {
      const shape = output && typeof output === 'object' ? output as Record<string, unknown> : {}
      const telemetry = toolId === 'model_control'
        ? Object.fromEntries(
            (['responseLength', 'startsWithObject', 'endsWithObject', 'hasThinkOpen', 'hasThinkClose', 'hasUnclosedObject', 'anyValidJson'] as const)
              .filter(key => typeof shape[key] === 'number' || typeof shape[key] === 'boolean')
              .map(key => [key, shape[key]]),
          )
        : {}
      return {
        ...base,
        ...builderPendingWriteEvidence(output),
        ...(typeof input.path === 'string' ? { path: input.path.slice(0, 240) } : {}),
        ...(toolId === 'edit_file' && ok && typeof input.search === 'string' && typeof input.replace === 'string'
          ? { change: { search: input.search.slice(0, 4000), replace: input.replace.slice(0, 4000),
              truncated: input.search.length > 4000 || input.replace.length > 4000 } } : {}),
        ...telemetry,
      }
    }
    const result = output && typeof output === 'object' ? output as Record<string, unknown> : {}
    return {
      ...base,
      ...builderRunSourceEvidence(output),
      command: typeof input.command === 'string' ? input.command.slice(0, 2_000) : '',
      ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
      ...(typeof result.stdout === 'string' ? { stdout: result.stdout.slice(0, 16_000) } : {}),
      ...(typeof result.stderr === 'string' ? { stderr: result.stderr.slice(0, 16_000) } : {}),
      ...(typeof result.timedOut === 'boolean' ? { timedOut: result.timedOut } : {}),
    }
  })
}

function oneLine(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(-500)
}

function fallbackFailureReply(error: string, trace: ReturnType<typeof publicTrace>): string {
  const tail = trace.slice(-5).map((entry: any) => {
    const parts = [`#${entry.round ?? '?'} ${entry.toolId || 'tool'} ${entry.ok ? 'ok' : 'failed'}`]
    if (typeof entry.exitCode === 'number') parts.push(`exit ${entry.exitCode}`)
    if (entry.command) parts.push(`$ ${oneLine(entry.command).slice(0, 180)}`)
    if (entry.error) parts.push(oneLine(entry.error))
    const stream = oneLine(entry.stderr) || oneLine(entry.stdout)
    if (stream) parts.push(stream)
    return `  ${parts.join(' · ')}`
  })
  const reason = /budget_exhausted|builder_turn_timeout|builder_time_budget_reached/.test(error)
    ? 'Builder reached its work limit before completing the requested files and verification.'
    : `Builder could not complete the task: ${error}`
  const execution = trace.some(entry => entry.toolId === 'run')
    ? formatBuilderExecutionEvidence(trace)
    : 'No command was run. No runtime or test result was recorded.'
  return `${reason}\n\n${execution}${tail.length ? `\n\nBuilder evidence:\n${tail.join('\n')}` : ''}`
}

function repairAwareFailureReply(job: BuilderJobRecord, error: string, trace: ReturnType<typeof publicTrace>): string {
  return isRepairObjective(job.objective)
    ? formatBuilderOperatorRepairReply({ ok: false, error, trace })
    : fallbackFailureReply(error, trace)
}

function historyReply(reply: string, workspaceId: string, files: readonly string[]): string {
  const links = files.slice(0, 20).map(path => {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    const label = path.replace(/[\[\]]/g, '')
    return `- [Download ${label}](/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${encodedPath})`
  })
  return links.length ? `${reply.trim()}\n\nBuilder files:\n${links.join('\n')}` : reply.trim()
}

async function terminalFailure(job: BuilderJobRecord, error: string, trace: readonly BuilderToolTrace[] = job.checkpoint?.trace || []): Promise<void> {
  const inferenceBudget = await readBuilderInferenceBudgetReceipt(getAdminSupabase(), job).catch(() => null)
  const safeTrace = publicTrace(trace)
  const workspace = createSupabaseBuilderWorkspace(job.userId)
  const plainReply = `${repairAwareFailureReply(job, error, safeTrace)}\n\n${builderNextAction(error, trace)}${builderInferenceBudgetSummary(inferenceBudget)}`
  // A missing or unreadable prior workspace is a real blocker, not a reason
  // to create an empty replacement through writeFile/listFiles.
  const unavailablePriorSource = error.startsWith('builder_existing_source_') || error === 'builder_existing_workspace_missing'
  if (workspace && !unavailablePriorSource) await workspace.writeFile(job.workspaceId, 'builder-result.txt', `${plainReply.trim()}\n`).catch(() => undefined)
  const files = workspace && !unavailablePriorSource
    ? await workspace.listFiles(job.workspaceId).then(items => items.map(item => item.path)).catch(() => [])
    : []
  const reply = historyReply(plainReply, job.workspaceId, files)
  await finishBuilderJob({
    jobId: job.id,
    userId: job.userId,
    claimGeneration: job.claimGeneration,
    status: 'failed',
    reply,
    error,
    result: {
      jobId: job.id,
      workspaceId: job.workspaceId,
      status: 'failed',
      error,
      reply,
      files,
      trace: safeTrace,
      ...(inferenceBudget ? { inferenceBudget } : {}),
    },
  })
  
  await recordBuilderCompetencyGap({
    jobId: job.id,
    objective: job.objective,
    error,
    ownerAuthorized: job.ownerAuthorized === true,
  }).catch(gapError => console.error('[builder_competency_gap_record_failed]', {
    jobId: job.id,
    message: gapError instanceof Error ? gapError.message : 'unknown',
  }))
}

async function runBuilderPlaywrightCliCanary(job: BuilderJobRecord): Promise<void> {
  if (job.ownerAuthorized !== true || job.metadata.builderPlaywrightCliCanary !== true) {
    throw new Error('builder_playwright_cli_canary_not_authorized')
  }

  const browserCli = createBuilderPlaywrightCliPort({ ownerAuthorized: true })
  const steps = [
    { action: 'open' as const, url: 'https://itmounts.com/' },
    { action: 'snapshot' as const },
    { action: 'console' as const, level: 'info' as const },
    { action: 'requests' as const },
    { action: 'close' as const },
  ]
  const evidence: Array<{
    action: string
    ok: boolean
    exitCode: number
    timedOut: boolean
    failureCode?: string
  }> = []

  try {
    for (const input of steps) {
      const observed = await browserCli.invoke(input)
      evidence.push({
        action: observed.action,
        ok: observed.ok,
        exitCode: observed.exitCode,
        timedOut: observed.timedOut,
        ...(observed.failureCode ? { failureCode: observed.failureCode } : {}),
      })
      if (!observed.ok) {
        const error = `builder_playwright_cli_canary_failed:${observed.action}:${observed.failureCode || 'cli_exit_nonzero'}`
        const reply = `Builder Playwright CLI Production canary failed at ${observed.action}.`
        await finishBuilderJob({
          jobId: job.id,
          userId: job.userId,
          claimGeneration: job.claimGeneration,
          status: 'failed',
          reply,
          error,
          result: {
            schemaVersion: 'builder-playwright-cli-production-canary-v1',
            jobId: job.id,
            workspaceId: job.workspaceId,
            status: 'failed',
            error,
            reply,
            evidence,
          },
        })
        return
      }
    }

    const reply = 'PLAYWRIGHT_CLI_CANARY_COMPLETE'
    await finishBuilderJob({
      jobId: job.id,
      userId: job.userId,
      claimGeneration: job.claimGeneration,
      status: 'succeeded',
      reply,
      result: {
        schemaVersion: 'builder-playwright-cli-production-canary-v1',
        jobId: job.id,
        workspaceId: job.workspaceId,
        status: 'succeeded',
        reply,
        evidence,
      },
    })
  } finally {
    await browserCli.close().catch(error => {
      console.warn('[builder_playwright_cli_canary_close_failed]', {
        message: error instanceof Error ? error.message : 'unknown',
      })
    })
  }
}

async function withBuilderSliceDeadline<T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('builder_model_round_timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Execute one already-enqueued Builder job. The atomic claim makes duplicate invocations harmless;
 * the browser never replays POST and polling GET has no execution authority.
 */
type IsolatedPublicationOutcome = { publication: Record<string, unknown> | null; publicationError: string | null }

/**
 * Publish host-verified workspace files: repository, pull request, a preview of the exact commit with the requested
 * endpoint checked, then the merge. Shared by Handle it for me (right after verification) and Work with me (after
 * the user's "go"), so both run the same code.
 */
type IsolatedPublicationInput = {
  job: BuilderJobRecord
  files: readonly string[]
  workspace: { readFile(workspaceId: string, path: string): Promise<{ path: string; content: string; updatedAt: number } | null> }
  signal: AbortSignal
  deadlineAt: number
}

/** One span for the whole publication; repository, PR, preview and merge HTTP calls are its child fetch spans. */
function publishIsolatedJobFiles(input: IsolatedPublicationInput): Promise<IsolatedPublicationOutcome> {
  return withSpan('builder.publish.isolated', { 'builder.job_id': input.job.id, 'builder.files': input.files.length }, async span => {
    const outcome = await publishIsolatedJobFilesUntraced(input)
    const publication = outcome.publication ?? {}
    span.setAttributes({
      'builder.publish.preview_status': String(publication.status ?? 'none'),
      'builder.publish.merged': typeof publication.mergeCommitSha === 'string',
    })
    if (outcome.publicationError) markActiveSpanFailed(outcome.publicationError)
    return outcome
  })
}

async function publishIsolatedJobFilesUntraced(input: IsolatedPublicationInput): Promise<IsolatedPublicationOutcome> {
  const { job } = input
  let publication: Record<string, unknown> | null = null
  try {
    // Isolated publication uses only an owner-authorized server credential. It is never
    // inferred from model text or from a customer's provider connection.
    if (!job.ownerAuthorized) throw new Error('builder_isolated_publication_not_authorized')
    const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN || ''
    const owner = process.env.BUILDER_ISOLATED_GITHUB_OWNER || ''
    const vercelToken = process.env.VERCEL_TOKEN || ''
    const projectId = process.env.BUILDER_ISOLATED_VERCEL_PROJECT_ID || ''
    if (!token || !owner || !vercelToken || !projectId) throw new Error('builder_isolated_publication_not_configured')
    if (Date.now() >= input.deadlineAt) throw new Error('builder_isolated_publication_deadline_exceeded')
    const contents = await Promise.all(input.files.map(path => input.workspace.readFile(job.workspaceId, path)))
    if (contents.some(file => !file)) throw new Error('builder_isolated_workspace_file_missing')
    const preparedFiles = isolatedDeploymentFiles(contents.filter((file): file is NonNullable<typeof file> => Boolean(file)))
    const published = await publishVerifiedIsolatedProject({
      owner, jobKey: job.id,
      newRepository: /\bcreate\s+(?:a\s+)?new\s+private\s+(?:GitHub\s+)?repository\b/i.test(job.objective),
      token, files: preparedFiles,
      verified: true, authorized: true, signal: input.signal,
      deadlineAt: input.deadlineAt,
    })
    publication = { ...published }
    const preview = await verifyIsolatedPreview({
      token: vercelToken, projectId, repository: published.repository,
      commitSha: published.commitSha, files: preparedFiles, objective: job.objective,
      deadlineAt: input.deadlineAt,
      signal: input.signal,
    })
    publication = { ...published, ...preview }
    // This lane is owner-only (checked above): the owner's job ends merged, not as a PR left for him.
    const merged = await mergeVerifiedIsolatedPullRequest({
      token, repository: published.repository, pullRequestNumber: published.pullRequestNumber,
      commitSha: published.commitSha, previewVerified: preview.status === 'verified',
      signal: input.signal, deadlineAt: input.deadlineAt,
    })
    publication = { ...published, ...preview, ...merged }
    return { publication, publicationError: null }
  } catch (error) {
    return { publication, publicationError: error instanceof Error ? error.message : 'builder_isolated_publication_failed' }
  }
}

/**
 * Work with me, after the user's "go": publish the work a previous job verified and paused, without any model call.
 * The approval is bound to that job and to the exact files it verified; any change since then refuses publication.
 */
async function runApprovedIsolatedPublication(job: BuilderJobRecord, totalDeadlineMs: number): Promise<void> {
  const workspace = createSupabaseBuilderWorkspace(job.userId)
  const source = await getBuilderJobForUser(String(job.metadata.approvedPublicationOf), job.userId)
  const saved = (source?.result ?? null) as Record<string, any> | null
  const awaiting = saved?.awaitingApproval as { action?: string; fingerprint?: string } | undefined
  if (!workspace || !source || source.workspaceId !== job.workspaceId || source.status !== 'succeeded'
    || awaiting?.action !== 'isolated_publication' || !saved?.acceptanceLedger || !Array.isArray(saved.files)) {
    await terminalFailure(job, 'builder_approval_source_unavailable')
    return
  }
  const files = (saved.files as unknown[]).filter((path): path is string => typeof path === 'string')
  if (await readBuilderWorkspaceFingerprint(job.userId, job.workspaceId) !== awaiting.fingerprint
    || awaiting.fingerprint !== job.metadata.approvedWorkspaceFingerprint) {
    const reply = historyReply(assistanceCopy(COLLABORATE_SOURCE_CHANGED, job.metadata.responseLanguage), job.workspaceId, files)
    await finishBuilderJob({ jobId: job.id, userId: job.userId, claimGeneration: job.claimGeneration, status: 'failed', reply,
      error: 'builder_approval_source_changed', result: { jobId: job.id, workspaceId: job.workspaceId, status: 'failed', reply, files, engine: 'v2' } })
    return
  }
  const controller = new AbortController()
  const deadlineAt = Date.parse(job.createdAt) + totalDeadlineMs
  const timer = setTimeout(() => controller.abort(new Error('builder_isolated_publication_deadline_exceeded')), Math.max(0, deadlineAt - Date.now()))
  timer.unref?.()
  const { publication, publicationError } = await publishIsolatedJobFiles({ job, files, workspace, signal: controller.signal, deadlineAt })
    .finally(() => clearTimeout(timer))
  const acceptance = saved.acceptanceLedger as ReturnType<typeof builderAcceptanceLedger>
  const inferenceBudget = saved.inferenceBudget && typeof saved.inferenceBudget === 'object' ? saved.inferenceBudget : null
  // Execution time is the machine's: the verifying job plus this one. Time spent waiting for the person is not counted.
  const elapsedMs = Math.max(0, Date.parse(source.finishedAt || source.updatedAt) - Date.parse(source.createdAt))
    + Math.max(0, Date.now() - Date.parse(job.createdAt))
  const finalProof = builderFinalProof({
    objective: job.objective, workspaceVerified: true, acceptance, publication, publicationError,
    budget: inferenceBudget ? { ...(inferenceBudget as any), elapsedMs } : null, requiresPublication: true,
  })
  const failure = publicationError || finalProof.failureCode
  const report = builderAcceptanceReport({
    jobId: job.id, files, receipts: Array.isArray(saved.receipts) ? saved.receipts : [], ledger: acceptance,
    proof: finalProof, publication, inferenceBudget: inferenceBudget as any, totalElapsedMs: elapsedMs, failure,
  })
  const reply = historyReply(report, job.workspaceId, files)
  await finishBuilderJob({
    jobId: job.id, userId: job.userId, claimGeneration: job.claimGeneration,
    status: finalProof.passed ? 'succeeded' : 'failed', reply, error: finalProof.passed ? null : failure,
    result: { jobId: job.id, workspaceId: job.workspaceId, status: finalProof.passed ? 'succeeded' : 'failed', reply, files,
      engine: 'v2', receipts: saved.receipts ?? [], acceptanceLedger: acceptance, finalProof, approvedFromJobId: source.id,
      ...(publication ? { isolatedPublication: publication } : {}), ...(inferenceBudget ? { inferenceBudget } : {}) },
  })
}

async function runBuilderJobInsideHarness(jobId: string, userId: string): Promise<void> {
  let job: BuilderJobRecord | null = null
  let lastTrace: readonly BuilderToolTrace[] = []
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  const executionStartedAt = Date.now()
  let claimGeneration: number | null = null
  try {
    job = await claimBuilderJob(jobId, userId)
    if (!job) return
    claimGeneration = job.claimGeneration
    console.info('[builder_job_lifecycle]', { phase: 'claimed', jobId, claimGeneration, workspaceId: job.workspaceId, jobKind: job.jobKind })
    // Fenced observability writes never extend the existing six-minute execution lease.
    // The worker remains authoritative for its lifecycle, regardless of telemetry health.
    const activeJob = job
    const db = getAdminSupabase()
    const heartbeat = async () => {
      const { error } = await db.rpc('heartbeat_builder_job', {
        p_job_id: activeJob.id, p_user_id: activeJob.userId, p_generation: activeJob.claimGeneration,
      })
      if (error) console.warn('[builder_job_heartbeat_failed]', { jobId, code: error.code })
    }
    await db.from('builder_jobs').update({
      last_started_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId).eq('user_id', userId).eq('claim_generation', job.claimGeneration)
      .eq('status', 'running').then(({ error }) => {
        if (error) console.warn('[builder_job_start_telemetry_failed]', { jobId, code: error.code })
      })
    heartbeatTimer = setInterval(() => { void heartbeat().catch(() => undefined) }, 30_000)
    heartbeatTimer.unref?.()

    if (job.claimGeneration === 1 && typeof job.metadata.approvedProposalFingerprint === 'string'
      && await readBuilderWorkspaceFingerprint(job.userId, job.workspaceId) !== job.metadata.approvedProposalFingerprint) {
      await terminalFailure(job, 'builder_proposal_source_changed')
      return
    }

    // VERIFICATION CAMPAIGN (2026-10-27): read-only checks against the live production path, never a workspace or a
    // repository. State lives in the checkpoint; the continuation cron resumes a paused campaign like any job.
    if (job.jobKind === 'standard' && job.metadata.builderEngine === CAMPAIGN_ENGINE) {
      if (builderJobOverTotalDeadline(job.createdAt, Date.now(), CAMPAIGN_TOTAL_DEADLINE_MS)) {
        await terminalFailure(job, 'builder_v2_total_deadline_exceeded')
        return
      }
      const sliceStartedAt = Date.now()
      const sliceController = new AbortController()
      const sliceTimer = setTimeout(() => sliceController.abort(new Error('builder_campaign_slice_deadline')), BUILDER_SLICE_HARD_DEADLINE_MS)
      sliceTimer.unref?.()
      let outcome: CampaignSliceOutcome
      try {
        const runningJob = job
        outcome = await runCampaignJobSlice({
          checkpoint: job.checkpoint, workspaceId: job.workspaceId, ports: createCampaignHostPorts(), signal: sliceController.signal,
          remainingMs: () => Math.max(0, sliceStartedAt + BUILDER_SLICE_HARD_DEADLINE_MS - Date.now()),
          checks: Array.isArray(job.metadata.campaignChecks) ? job.metadata.campaignChecks : null,
          // Live status after every finished check, written only while this exact claim still runs the job, so a late
          // write can never replace the paused or final reply.
          progress: async update => {
            const { error } = await db.from('builder_jobs').update({
              result: { jobId: runningJob.id, workspaceId: runningJob.workspaceId, status: 'running', reply: update.reply, files: [], engine: CAMPAIGN_ENGINE, campaignProgress: { done: update.done, total: update.total } },
            }).eq('id', runningJob.id).eq('user_id', runningJob.userId).eq('claim_generation', runningJob.claimGeneration).eq('status', 'running')
            if (error) console.warn('[builder-campaign-progress] write failed', error.message)
          },
        })
      } catch (error) {
        clearTimeout(sliceTimer)
        await terminalFailure(job, `builder_campaign_slice_failed: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      clearTimeout(sliceTimer)
      if (outcome.status === 'paused') {
        if (job.claimGeneration >= MAX_WORK_SLICES) {
          await terminalFailure(job, 'builder_continuation_budget_exhausted')
          return
        }
        const { data, error } = await db.rpc('pause_builder_job_slice', {
          p_job_id: job.id, p_user_id: job.userId, p_generation: job.claimGeneration,
          p_checkpoint: outcome.checkpoint, p_reply: outcome.reply,
          p_result: { jobId: job.id, workspaceId: job.workspaceId, status: 'paused', reply: outcome.reply, files: [], engine: CAMPAIGN_ENGINE, campaignProgress: { done: outcome.done, total: outcome.total } },
        })
        if (error) throw new Error(`builder_campaign_checkpoint_persist_failed: ${error.message}`)
        // False means the RPC refused the checkpoint (claim fence or shape): a running job with no saved progress
        // would never resume, so it ends here with the cause rather than hanging.
        if (data !== true) { await terminalFailure(job, 'builder_campaign_checkpoint_refused'); return }
        return
      }
      await finishBuilderJob({
        jobId: job.id, userId: job.userId, claimGeneration: job.claimGeneration,
        status: outcome.status, reply: outcome.reply, error: outcome.status === 'failed' ? `builder_campaign_${outcome.outcome.toLowerCase()}` : null,
        result: { jobId: job.id, workspaceId: job.workspaceId, status: outcome.status, reply: outcome.reply, files: [], engine: CAMPAIGN_ENGINE, ...outcome.result },
      })
      return
    }

    // V2 is selected by durable job metadata for all surfaces. Existing V1
    if (readBuilderRunLimits(job.objective) && (job.jobKind !== 'standard' || job.metadata.builderEngine !== 'v2' || job.metadata.platformRepair === true)) {
      await terminalFailure(job, 'builder_budget_v2_required')
      return
    }
    // checkpoint jobs remain V1 because their engine tag is absent.
    if (job.jobKind === 'standard' && job.metadata.builderEngine === 'v2' && job.metadata.platformRepair !== true) {
      const runLimits = readBuilderRunLimits(job.objective)
      const totalDeadlineMs = runLimits?.maxElapsedMs ?? BUILDER_JOB_TOTAL_DEADLINE_MS
      if (builderJobOverTotalDeadline(job.createdAt, Date.now(), totalDeadlineMs)) {
        await terminalFailure(job, 'builder_v2_total_deadline_exceeded')
        return
      }
      if (typeof job.metadata.approvedPublicationOf === 'string') {
        await runApprovedIsolatedPublication(job, totalDeadlineMs)
        return
      }
      const workspace = createSupabaseBuilderWorkspace(job.userId)
      if (!workspace) { await terminalFailure(job, 'builder_v2_workspace_unavailable'); return }
      // Same priority rule as V1: only background self-healing work yields the model to chat. Production
      // 2026-10-16: V2 always yielded, so an owner's own chat refused every model call of the build it started.
      const ai = createGovernedBuilderAiPort(createBuilderCodingAiPort({ yieldToChat: selfHealingCapacityJob(job) }), {
        deadlineAtMs: Date.now() + 210_000,
      })
      const browserPortV2 = createBuilderPlaywrightCliPort({ ownerAuthorized: job.ownerAuthorized === true })
      const deadlineController = new AbortController()
      const deadlineTimer = setTimeout(() => deadlineController.abort(new Error('builder_v2_total_deadline_exceeded')),
        Math.max(0, Date.parse(job.createdAt) + totalDeadlineMs - Date.now()))
      deadlineTimer.unref?.()
      const v2 = new BuilderV2Agent(ai, new BuilderV2Dispatcher(workspace, new VercelSandboxBuilderRunner(), {
        beforeRun({ workspaceId, command }) {
          if (workspaceId !== job.workspaceId || !command.trim()) throw Error('builder_execution_context_denied')
        },
        afterRun({ result }) {
          // Privacy-safe operational evidence: no command arguments, output or customer files.
          console.info('[builder_v2_execution_observed]', {
            jobId: job.id, claimGeneration: job.claimGeneration,
            status: result.timedOut ? 'timeout' : result.exitCode === 0 ? 'passed' : 'failed',
          })
        },
        onError() {
          console.warn('[builder_v2_execution_runtime_error]', { jobId: job.id, claimGeneration: job.claimGeneration })
        },
      }, browserPortV2), workspace)
      const cycle = await (async () => {
        try {
          const executeCycle = () => withBuilderInferenceJob(job.id, () => withBuilderSliceDeadline(() => runBuilderV2JobCycle({
            jobId: job.id, claimGeneration: job.claimGeneration,
            store: createBuilderV2SupabaseLeaseStore(db, job.userId),
            agent: v2, maxSteps: BUILDER_SLICE_MAX_STEPS, signal: deadlineController.signal,
          }), BUILDER_SLICE_HARD_DEADLINE_MS))
          return runLimits
            ? await withBuilderInferenceBudget(createBuilderInferenceBudgetStore(db, job), Date.parse(job.createdAt) + totalDeadlineMs, executeCycle)
            : await executeCycle()
        } finally {
          clearTimeout(deadlineTimer)
          // Every V2 work slice owns its browser sandbox; never leak it across claims.
          await browserPortV2.close().catch(() => console.warn('[builder_v2_browser_cleanup_failed]', { jobId: job.id }))
        }
      })()
      if (cycle.status === 'lost_lease') return
      const inferenceBudget = await readBuilderInferenceBudgetReceipt(db, job)
      const budgetReport = builderInferenceBudgetSummary(inferenceBudget)
      const files = (await workspace.listFiles(job.workspaceId)).map(file => file.path)
      // What the build did so far, from host receipts, on every update the person sees.
      const progress = builderV2ProgressReport(job.objective, files, cycle.result?.steps ?? [],
        { current: job.claimGeneration, max: MAX_WORK_SLICES })
      if (cycle.status === 'paused' && cycle.result?.checkpoint) {
        const previous = job.checkpoint as unknown as BuilderV2Checkpoint | null
        const current = cycle.result.checkpoint
        const idleSlices = builderV2IdleSliceCount(previous, current)
        // A timeout or empty model turn can pause without a single executed action.
        // After repeated empty continuations, preserve the workspace but terminate
        // rather than re-queueing the same checkpoint indefinitely.
        if (idleSlices >= 3) {
          const reason = 'builder_v2_continuation_no_progress'
          const reply = historyReply(`${assistanceCopy(BUILDER_RESULT_STALLED, job.metadata.responseLanguage)}\n\n${progress}${budgetReport}`, job.workspaceId, files)
          await finishBuilderJob({
            jobId: job.id, userId: job.userId, claimGeneration: job.claimGeneration,
            status: 'failed', reply, error: reason,
            result: { jobId: job.id, workspaceId: job.workspaceId, status: 'failed',
              reply, files, engine: 'v2', receipts: cycle.result.steps, ...(inferenceBudget ? { inferenceBudget } : {}) },
          })
          return
        }
        const checkpoint: BuilderV2Checkpoint = { ...current, idleSlices }
        const reply = historyReply(`${assistanceCopy(BUILDER_RESULT_CONTINUING, job.metadata.responseLanguage)}\n\n${progress}${budgetReport}`, job.workspaceId, files)
        const { data, error } = await db.rpc('pause_builder_job_slice', {
          p_job_id: job.id, p_user_id: job.userId, p_generation: job.claimGeneration,
          p_checkpoint: checkpoint, p_reply: reply,
          p_result: { jobId: job.id, workspaceId: job.workspaceId, status: 'paused', reply, files, engine: 'v2', ...(inferenceBudget ? { inferenceBudget } : {}) },
        })
        if (error) throw new Error(`builder_v2_checkpoint_persist_failed: ${error.message}`)
        if (data === true) return
        // Not paused: at the slice cap the job finishes below with that outcome; otherwise another claim owns it.
        if (job.claimGeneration < MAX_WORK_SLICES) return
      }
      const acceptance = builderAcceptanceLedger(job.objective, cycle.result?.steps ?? [])
      const verified = cycle.status === 'verified'
      const requiresPublication = wantsIsolatedPublication(job.objective)
      const reason = cycle.status === 'paused' ? 'builder_continuation_budget_exhausted' : cycle.reason
      let publication: Record<string, unknown> | null = null
      let publicationError: string | null = null
      if (verified && acceptance.passed && requiresPublication) {
        // Work with me: the work is verified in the sandbox; nothing leaves it until the user says "go".
        if (job.metadata.assistanceMode === 'collaborate') {
          const fingerprint = await readBuilderWorkspaceFingerprint(job.userId, job.workspaceId)
          const reply = historyReply(`${assistanceCopy(COLLABORATE_PUBLICATION_PAUSED, job.metadata.responseLanguage)}\n\n${progress}${budgetReport}`, job.workspaceId, files)
          await finishBuilderJob({
            jobId: job.id, userId: job.userId, claimGeneration: job.claimGeneration,
            status: 'succeeded', reply, error: null,
            result: { jobId: job.id, workspaceId: job.workspaceId, status: 'awaiting_approval',
              reply, files, engine: 'v2', receipts: cycle.result?.steps ?? [], acceptanceLedger: acceptance,
              awaitingApproval: { action: 'isolated_publication', fingerprint, requestedAt: new Date().toISOString() },
              ...(inferenceBudget ? { inferenceBudget } : {}) },
          })
          return
        }
        ;({ publication, publicationError } = await publishIsolatedJobFiles({
          job, files, workspace, signal: deadlineController.signal, deadlineAt: Date.parse(job.createdAt) + totalDeadlineMs,
        }))
      }
      const finalProof = builderFinalProof({
        objective: job.objective, workspaceVerified: verified, acceptance,
        publication, publicationError,
        budget: inferenceBudget ? { ...inferenceBudget, elapsedMs: Math.max(0, Date.now() - Date.parse(job.createdAt)) } : null,
        requiresPublication,
      })
      const success = finalProof.passed
      const publicationReport = publication ? `\n\nIsolated publication: ${JSON.stringify(publication)}` : ''
      // Any isolated publication gets a structured evidence report, not just a named sample application.
      const wantsAcceptanceReport = requiresPublication || /\b(?:final acceptance report|end-to-end acceptance test)\b/i.test(job.objective)
      const acceptanceReport = wantsAcceptanceReport ? builderAcceptanceReport({
        jobId: job.id, files, receipts: cycle.result?.steps ?? [], ledger: acceptance,
        proof: finalProof, publication, inferenceBudget,
        totalElapsedMs: Math.max(0, Date.now() - Date.parse(job.createdAt)),
        failure: publicationError || acceptance.failureCode || finalProof.failureCode || reason,
      }) : null
      const commandsProven = (cycle.result?.steps ?? []).filter(step => step.tool === 'run_tests' && step.ok)
        .map(step => String((step.output as { requestedCommand?: unknown } | undefined)?.requestedCommand ?? '')).filter(Boolean)
      const syntaxOnly = commandsProven.length > 0
        && commandsProven.every(command => /^node\\s+(?:--check|-c)\\s+/i.test(command.trim()))
      // A syntax check alone never reads as a working result (#4816). The failure code stays in the job's error column.
      const reply = acceptanceReport ? historyReply(acceptanceReport, job.workspaceId, files) : historyReply(success
        ? `${assistanceCopy(syntaxOnly ? BUILDER_RESULT_SYNTAX_ONLY : BUILDER_RESULT_DONE, job.metadata.responseLanguage)}${publicationReport}${budgetReport}`
        : `${assistanceCopy(BUILDER_RESULT_NOT_FINISHED, job.metadata.responseLanguage)}\n\n${progress}${publicationReport}${budgetReport}`, job.workspaceId, files)
      await finishBuilderJob({
        jobId: job.id, userId: job.userId, claimGeneration: job.claimGeneration,
        status: success ? 'succeeded' : 'failed', reply, error: success ? null : (publicationError || acceptance.failureCode || finalProof.failureCode || reason),
        result: { jobId: job.id, workspaceId: job.workspaceId, status: success ? 'succeeded' : 'failed',
          reply, files, engine: 'v2', receipts: cycle.result?.steps ?? [], acceptanceLedger: acceptance, finalProof,
          ...(publication ? { isolatedPublication: publication } : {}),
          ...(inferenceBudget ? { inferenceBudget } : {}) },
      })
      return
    }

    // Production acceptance is a host-owned, owner-only lane. It must complete in one claim:
    // browser state and browser_cli evidence are deliberately not persisted across Builder checkpoints.
    if (job.ownerAuthorized === true && job.metadata.builderPlaywrightCliCanary === true) {
      await runBuilderPlaywrightCliCanary(job)
      return
    }

    // Preserve the explicit metadata lane's authority check before any target parsing. The recovery
    // path below is owner-only too, so a dropped metadata bit cannot broaden repository authority.
    let parsedLogTarget = null
    if (job.metadata.platformRepair === true) {
      if (!job.ownerAuthorized) {
        await terminalFailure(job, 'builder_repository_repair_owner_required')
        return
      }
      parsedLogTarget = parseSignalBoostRepositoryRepairTarget(job.metadata.platformRepair === true && typeof job.metadata.repairExecutionObjective === 'string' ? job.metadata.repairExecutionObjective : job.objective)
    } else if (job.ownerAuthorized) {
      // Owner jobs that carry a failed SignalBoost Vercel clone log must enter Platform Engineer
      // even if enqueue dropped the platformRepair metadata. Isolated sandbox Builder cannot commit.
      parsedLogTarget = parseSignalBoostRepositoryRepairTarget(job.objective)
    }
    const treatAsPlatformRepair = job.metadata.platformRepair === true || Boolean(parsedLogTarget)

    if (treatAsPlatformRepair) {
      const exactTarget = parsedLogTarget ?? parseSignalBoostRepositoryRepairTarget(job.metadata.platformRepair === true && typeof job.metadata.repairExecutionObjective === 'string' ? job.metadata.repairExecutionObjective : job.objective)
      const target = exactTarget ?? signalBoostDeployedRepairTarget(job.objective, {
        commitSha: job.metadata.commitSha,
        branch: job.metadata.branch,
      }, { ownerDeveloperLogSubmission: true })
      if (!target) {
        await terminalFailure(job, 'builder_repository_repair_target_unavailable')
        return
      }
      const execution = await executeSignalBoostRepositoryRepair({
        userId: job.userId,
        ownerAuthorized: job.ownerAuthorized === true,
        rawObjective: job.objective,
        workspaceId: job.workspaceId,
        target,
        ...(selfHealingCapacityJob(job)
          ? { deadlineAtMs: Date.now() + SELF_HEALING_REPOSITORY_BUDGET_MS }
          : {}),
        // Null when Vercel credentials are absent, which auto-merge refuses on.
        snapshotPort: builderAutoMergeSnapshotPort(),
        holdMerge: job.metadata.assistanceMode === 'collaborate',
        responseLanguage: job.metadata.responseLanguage,
        continuation: {
          jobId: job.id,
          claimGeneration: job.claimGeneration,
          checkpoint: isRepositoryRepairCheckpoint(job.checkpoint) ? job.checkpoint : null,
          // Each step's checkpoint is written only while this exact claim still runs the job.
          persist: async checkpoint => {
            const { data, error } = await db.from('builder_jobs').update({ checkpoint })
              .eq('id', job!.id).eq('user_id', job!.userId).eq('claim_generation', job!.claimGeneration).eq('status', 'running')
              .select('id')
            if (error) throw new Error(`builder_repository_repair_checkpoint_persist_failed: ${error.message}`)
            return Array.isArray(data) && data.length === 1
          },
        },
      })
      if (!execution) {
        await terminalFailure(job, 'builder_repository_repair_target_unavailable')
        return
      }
      if (execution.lostLease) return
      // The slice ended with the repair unfinished (step budget, slice deadline, spent slice provider budget): pause with
      // the checkpoint so the next slice resumes it. Three slices in a row without progress end the job instead.
      if (execution.paused) {
        const previous = isRepositoryRepairCheckpoint(job.checkpoint) ? job.checkpoint : null
        const idleSlices = builderV2IdleSliceCount(previous, execution.paused.checkpoint)
        const files = Array.isArray(execution.payload.files) ? execution.payload.files.map(String) : []
        const progress = builderV2ProgressReport(job.objective, files, execution.paused.steps, { current: job.claimGeneration, max: MAX_WORK_SLICES })
        if (idleSlices >= 3) {
          const reply = historyReply(`${assistanceCopy(BUILDER_RESULT_STALLED, job.metadata.responseLanguage)}\n\n${progress}`, job.workspaceId, files)
          await finishBuilderJob({
            jobId: job.id, userId: job.userId, claimGeneration: job.claimGeneration,
            status: 'failed', reply, error: 'builder_v2_continuation_no_progress',
            result: { ...execution.payload, jobId: job.id, workspaceId: job.workspaceId, status: 'failed', reply, receipts: execution.paused.steps },
          })
          return
        }
        const reply = historyReply(`${assistanceCopy(BUILDER_RESULT_CONTINUING, job.metadata.responseLanguage)}\n\n${progress}`, job.workspaceId, files)
        const { data: paused, error: pauseError } = await db.rpc('pause_builder_job_slice', {
          p_job_id: job.id, p_user_id: job.userId, p_generation: job.claimGeneration,
          p_checkpoint: { ...execution.paused.checkpoint, idleSlices }, p_reply: reply,
          p_result: { ...execution.payload, jobId: job.id, workspaceId: job.workspaceId, status: 'paused', reply },
        })
        if (pauseError) throw new Error(`builder_repository_repair_pause_failed: ${pauseError.message}`)
        if (paused === true) return
        // Not paused: at the slice cap the repair ends unfinished; otherwise another claim owns the job.
        if (job.claimGeneration < MAX_WORK_SLICES) return
        await terminalFailure(job, 'builder_continuation_budget_exhausted')
        return
      }
      const payload = execution.payload
      const error = typeof payload.error === 'string' ? payload.error : null
      const succeeded = execution.status >= 200 && execution.status < 300 && !error
      const safeTrace = Array.isArray(payload.trace) ? payload.trace as ReturnType<typeof publicTrace> : []
      if (!succeeded && await deferSelfHealingCapacity(job, error, safeTrace)) return
      const baseReply = typeof payload.reply === 'string'
        ? payload.reply
        : fallbackFailureReply(error || 'builder_repository_repair_failed', safeTrace)
      const reply = isRepairObjective(job.objective)
        ? formatBuilderOperatorRepairReply({ ok: succeeded, answer: succeeded ? baseReply : undefined, error: error || undefined, trace: safeTrace })
        : baseReply
      await finishBuilderJob({
        jobId: job.id,
        userId: job.userId,
        claimGeneration: job.claimGeneration,
        status: succeeded ? 'succeeded' : 'failed',
        reply,
        ...(error ? { error } : {}),
        result: { ...payload, jobId: job.id, workspaceId: job.workspaceId, reply },
      })
      // The database may convert a PR-awaiting-merge result to paused. Its terminal evidence is
      // recorded only by repository-repair-job-lifecycle after the fenced reconciliation write.
      return
    }

    // V1 has been retired. Every Builder lane above returned: campaign, V2, production acceptance and repository
    // repair (which runs on V2). Anything else is a retired V1 job, including a resumed V1 checkpoint claim; it is
    // never replayed as V2, it ends with that reason.
    await terminalFailure(job, 'builder_v1_retired_use_v2')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_job_failed'
    console.error('[builder_job_execution_failed]', { jobId, message })
    if (job) {
      const trace = lastTrace.length ? lastTrace : job.checkpoint?.trace || []
      if (await deferSelfHealingCapacity(job, message, trace).catch(deferError => {
        console.error('[builder_self_healing_capacity_defer_failed]', {
          jobId,
          message: deferError instanceof Error ? deferError.message : 'unknown',
        })
        return false
      })) return
      await terminalFailure(job, message === BUILDER_TURN_TIMEOUT_ERROR ? BUILDER_TURN_TIMEOUT_ERROR : message, trace).catch(finishError => {
        console.error('[builder_job_terminal_persist_failed]', {
          jobId,
          message: finishError instanceof Error ? finishError.message : 'unknown',
        })
      })
    }
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    // Correlate job slices without logging objectives, prompts, secrets or file contents.
    if (claimGeneration !== null) console.info('[builder_job_lifecycle]', {
      phase: 'slice_finished', jobId, claimGeneration, elapsedMs: Date.now() - executionStartedAt,
    })
  }
}


/**
 * Mandatory Platform Harness ingress for every durable Builder execution.
 * A durable job never inherits the interactive COS turn deadline of the request that queued it
 * (Next.js after() snapshots that context); its only clock is this Harness deadline.
 */
export async function runBuilderJob(jobId: string, userId: string): Promise<void> {
  // Every work slice continues the trace of the request that queued the job, so one trace id covers the chat
  // message, each slice, every model call and tool step, publication and the job's failure.
  const queued = await peekBuilderJob(jobId, userId).catch(() => null)
  return withTraceparent(queued?.metadata.traceparent, () => withSpan('builder.job.slice', {
    'builder.job_id': jobId,
    'builder.job_kind': queued?.jobKind ?? 'unknown',
    'builder.platform_repair': queued?.metadata.platformRepair === true,
  }, () => runBuilderJobInHarness(jobId, userId)))
}

function runBuilderJobInHarness(jobId: string, userId: string): Promise<void> {
  return runWithoutTurnDeadline(() => withHostProductionHarnessIngress({
    objective: `Execute durable Builder job ${jobId}`,
    portableId: 'cos-builder',
    agentId: 'cos-builder-worker',
    role: 'software_specialist',
    capabilityId: 'builder.job.execute',
    risk: 'write',
    deadlineMs: 300_000,
    maxConcurrency: 1,
    maxToolCalls: 200,
    maxCostUsd: deepInfraMaxRunUsd('builder'),
    runId: `builder-job-${jobId}`,
  }, () => runBuilderJobInsideHarness(jobId, userId)))
}
