import { builderAcceptanceReport } from './acceptance-report.ts'
import { builderFinalProof } from './final-proof.ts'
import { builderAcceptanceLedger } from './acceptance-ledger.ts'
import type { BuilderLoopCheckpoint } from './checkpoint.ts'
import { publishVerifiedIsolatedProject, mergeVerifiedIsolatedPullRequest, verifyIsolatedPreview, isolatedDeploymentFiles, wantsIsolatedPublication } from './isolated-publication.ts'
import { withHostProductionHarnessIngress } from '../../platform-harness/runtime/host-ingress.ts'
import { classifyBuilderDocumentationIntent } from './documentation-intent.ts'
import { builderRunSourceEvidence } from './source-evidence.ts'
import { builderPendingWriteEvidence } from './evidence-events.ts'
// lib/builder/job-runner.ts
import { createBuilderCodingAiPort } from '../cos/aiPort.ts'
import { readBuilderRunLimits, withBuilderInferenceBudget } from './inference-budget.ts'
import { builderInferenceBudgetSummary, createBuilderInferenceBudgetStore, readBuilderInferenceBudgetReceipt } from './inference-budget-store.ts'
import { BUILDER_TURN_TIMEOUT_ERROR, createGovernedBuilderAiPort } from './control-adapter.ts'
import type { BuilderToolTrace } from './contracts.ts'
import { runDebugFileJob, type DebugFilePlan } from './debug-file-job.ts'
import { finishBuilderJob, claimBuilderJob, deferBuilderJobForCapacity, pauseBuilderJob, requeueBuilderContinuationCycle, readBuilderWorkspaceFingerprint, type BuilderJobRecord } from './job-store.ts'
import { MAX_WORK_SLICES, builderMayContinue, builderSliceMadeProgress, builderWorkLimitReport, builderJobOverTotalDeadline, BUILDER_JOB_TOTAL_DEADLINE_MS } from './work-budget.ts'
import { builderContractObjective, builderTaskContract, builderTaskProgress } from './task-contract.ts'
import { formatBuilderOperatorRepairReply } from './operator-narration.ts'
import { builderNextAction } from './user-guidance.ts'
import { isRepairObjective } from './regression-gate.ts'
import { formatBuilderExecutionEvidence } from './execution-evidence.ts'
import { explainInitialBuilderRepair } from './explain-evidence.ts'
import { BuilderToolLoop } from './tool-loop.ts'
import { BuilderV2Agent, builderV2ProgressReport, builderV2IdleSliceCount, type BuilderV2Checkpoint } from './agent-v2.ts'
import { BuilderV2Dispatcher } from './agent-v2-dispatcher.ts'
import { runBuilderV2JobCycle } from './agent-v2-job-cycle.ts'
import { createBuilderV2SupabaseLeaseStore } from './agent-v2-supabase-store.ts'
import { createBuilderMcpReadPort } from './mcp-read-port.ts'
import { createBuilderPlaywrightCliPort } from './playwright-cli-port.ts'
import { VercelSandboxBuilderRunner } from './vercel-sandbox-runner.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'
import { executeSignalBoostRepositoryRepair } from './repository-repair.ts'
import { parseSignalBoostRepositoryRepairTarget, signalBoostDeployedRepairTarget } from './repository-repair-target.ts'
import { inspectBuilderContinuationSource } from './continuation-source.ts'
import { builderAutoMergeSnapshotPort } from './repository-repair-snapshot-host.ts'
import { retrieveValidatedCognitiveSkills, type CognitiveSkillContextResult } from '@/lib/ai/cos/cognitiveSkillContext'
import { recordVerifiedCognitiveProductionOutcome } from '@/lib/ai/cos/cognitiveProductionOutcome'
import { verifiedBuilderCognitiveApplication } from './cognitive-application.ts'
import { deepInfraMaxRunUsd } from '../ai/cos/deepInfraSpendPolicy.ts'
import { runWithoutTurnDeadline } from '../ai/cos/cosTurnBudget.ts'
import { workingAgentKnowledgeBlock } from '@/lib/ai/cos/workingAgentKnowledge'
import { formatBuilderEpisodesForPrompt, recordBuilderEpisode, retrieveBuilderEpisodes } from './episodic-memory.ts'
import { recordBuilderCompetencyGap } from './competency-gap.ts'
import { getAdminSupabase } from '@/utils/supabase/server'

const BUILDER_JOB_BUDGET_MS = 260_000
const BUILDER_JOB_RESULT_RESERVE_MS = 20_000
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

const emptyCognitiveContext = (): CognitiveSkillContextResult => ({ retrieved: 0, relevant: 0, selected: 0, dependencyRejected: 0, items: [] })

async function recordAppliedCognitiveSkills(job: BuilderJobRecord, skillKeys: readonly string[], successfulRuns: number): Promise<void> {
  await Promise.all(skillKeys.map(skillKey => recordVerifiedCognitiveProductionOutcome({
    skillKey,
    success: true,
    score: 1,
    evidence: {
      source: 'cos_software_specialist_builder',
      builderJobId: job.id,
      verification: 'workspace_changed_and_host_command_exit_zero',
      successfulRuns,
      authorityGranted: false,
    },
  }).catch(error => {
    console.error('[builder_cognitive_application_record_failed]', { skillKey, message: error instanceof Error ? error.message : 'unknown' })
  })))
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

function debugPlan(job: BuilderJobRecord): DebugFilePlan | null {
  if (job.jobKind !== 'debug_file') return null
  const path = typeof job.metadata.debugPath === 'string' ? job.metadata.debugPath : ''
  const command = typeof job.metadata.debugCommand === 'string' ? job.metadata.debugCommand : ''
  const runtime = job.metadata.debugRuntime === 'python3' ? 'python3' : 'node'
  const rawPaths = Array.isArray(job.metadata.debugPaths) ? job.metadata.debugPaths : []
  const files = rawPaths.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  if (!path || !command) return null
  return Object.freeze({ path, command, runtime, files: files.length ? files : [path] })
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

    // V2 is selected by durable job metadata for all surfaces. Existing V1
    if (readBuilderRunLimits(job.objective) && (job.jobKind !== 'standard' || job.metadata.builderEngine !== 'v2' || job.metadata.platformRepair === true)) {
      await terminalFailure(job, 'builder_budget_v2_required')
      return
    }
    // checkpoint jobs remain V1 because their engine tag is absent.
    if (job.jobKind === 'standard' && job.metadata.builderEngine === 'v2') {
      const runLimits = readBuilderRunLimits(job.objective)
      const totalDeadlineMs = runLimits?.maxElapsedMs ?? BUILDER_JOB_TOTAL_DEADLINE_MS
      if (builderJobOverTotalDeadline(job.createdAt, Date.now(), totalDeadlineMs)) {
        await terminalFailure(job, 'builder_v2_total_deadline_exceeded')
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
          const executeCycle = () => withBuilderSliceDeadline(() => runBuilderV2JobCycle({
            jobId: job.id, claimGeneration: job.claimGeneration,
            store: createBuilderV2SupabaseLeaseStore(db, job.userId),
            agent: v2, maxSteps: 24, signal: deadlineController.signal,
          }), BUILDER_SLICE_HARD_DEADLINE_MS)
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
          const reply = historyReply(`Builder V2 stopped after three consecutive work slices without a new tool receipt or source revision. No verification was completed. The workspace is preserved.\n\n${progress}${budgetReport}`, job.workspaceId, files)
          await finishBuilderJob({
            jobId: job.id, userId: job.userId, claimGeneration: job.claimGeneration,
            status: 'failed', reply, error: reason,
            result: { jobId: job.id, workspaceId: job.workspaceId, status: 'failed',
              reply, files, engine: 'v2', receipts: cycle.result.steps, ...(inferenceBudget ? { inferenceBudget } : {}) },
          })
          return
        }
        const checkpoint: BuilderV2Checkpoint = { ...current, idleSlices }
        const reply = historyReply(`Builder V2 saved its progress and will continue automatically. Verification is not complete.\n\n${progress}${budgetReport}`, job.workspaceId, files)
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
        try {
          // Isolated publication uses only an owner-authorized server credential. It is never
          // inferred from model text or from a customer's provider connection.
          if (!job.ownerAuthorized) throw new Error('builder_isolated_publication_not_authorized')
          const token = process.env.GITHUB_WRITE_TOKEN || process.env.GITHUB_TOKEN || ''
          const owner = process.env.BUILDER_ISOLATED_GITHUB_OWNER || ''
          const vercelToken = process.env.VERCEL_TOKEN || ''
          const projectId = process.env.BUILDER_ISOLATED_VERCEL_PROJECT_ID || ''
          if (!token || !owner || !vercelToken || !projectId) throw new Error('builder_isolated_publication_not_configured')
          if (builderJobOverTotalDeadline(job.createdAt, Date.now(), totalDeadlineMs)) throw new Error('builder_isolated_publication_deadline_exceeded')
          const contents = await Promise.all(files.map(path => workspace.readFile(job.workspaceId, path)))
          if (contents.some(file => !file)) throw new Error('builder_isolated_workspace_file_missing')
          const preparedFiles = isolatedDeploymentFiles(contents.filter((file): file is NonNullable<typeof file> => Boolean(file)))
          const published = await publishVerifiedIsolatedProject({
            owner, jobKey: job.id,
            newRepository: /\bcreate\s+(?:a\s+)?new\s+private\s+(?:GitHub\s+)?repository\b/i.test(job.objective),
            token, files: preparedFiles,
            verified: true, authorized: true, signal: deadlineController.signal,
            deadlineAt: Date.parse(job.createdAt) + totalDeadlineMs,
          })
          publication = { ...published }
          const preview = await verifyIsolatedPreview({
            token: vercelToken, projectId, repository: published.repository,
            commitSha: published.commitSha, files: preparedFiles, objective: job.objective,
            deadlineAt: Date.parse(job.createdAt) + totalDeadlineMs,
            signal: deadlineController.signal,
          })
          publication = { ...published, ...preview }
          // This lane is owner-only (checked above): the owner's job ends merged, not as a PR left for him.
          const merged = await mergeVerifiedIsolatedPullRequest({
            token, repository: published.repository, pullRequestNumber: published.pullRequestNumber,
            commitSha: published.commitSha, previewVerified: preview.status === 'verified',
            signal: deadlineController.signal, deadlineAt: Date.parse(job.createdAt) + totalDeadlineMs,
          })
          publication = { ...published, ...preview, ...merged }
        } catch (error) {
          publicationError = error instanceof Error ? error.message : 'builder_isolated_publication_failed'
        }
      }
      const finalProof = builderFinalProof({
        objective: job.objective, workspaceVerified: verified, acceptance,
        publication, publicationError,
        budget: inferenceBudget ? { ...inferenceBudget, elapsedMs: Math.max(0, Date.now() - Date.parse(job.createdAt)) } : null,
        requiresPublication,
      })
      const success = finalProof.passed
      const publicationReport = publication ? `\n\nIsolated publication: ${JSON.stringify(publication)}` : ''
      const wantsAcceptanceReport = /(?:Calculator API|final acceptance report|end-to-end acceptance test)/i.test(job.objective)
      const acceptanceReport = wantsAcceptanceReport ? builderAcceptanceReport({
        jobId: job.id, files, receipts: cycle.result?.steps ?? [], ledger: acceptance,
        proof: finalProof, publication, inferenceBudget,
        totalElapsedMs: Math.max(0, Date.now() - Date.parse(job.createdAt)),
        failure: publicationError || acceptance.failureCode || finalProof.failureCode || reason,
      }) : null
      const reply = acceptanceReport ? historyReply(acceptanceReport, job.workspaceId, files) : historyReply(success
        ? `Builder V2 verified the workspace with recorded host test execution. ${cycle.result?.summary || ''}${publicationReport}${budgetReport}`
        : `Builder V2 could not complete verification: ${publicationError || acceptance.failureCode || finalProof.failureCode || reason}\n\n${progress}${publicationReport}${budgetReport}`, job.workspaceId, files)
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
      parsedLogTarget = parseSignalBoostRepositoryRepairTarget(job.objective)
    } else if (job.ownerAuthorized) {
      // Owner jobs that carry a failed SignalBoost Vercel clone log must enter Platform Engineer
      // even if enqueue dropped the platformRepair metadata. Isolated sandbox Builder cannot commit.
      parsedLogTarget = parseSignalBoostRepositoryRepairTarget(job.objective)
    }
    const treatAsPlatformRepair = job.metadata.platformRepair === true || Boolean(parsedLogTarget)

    if (treatAsPlatformRepair) {
      const exactTarget = parsedLogTarget ?? parseSignalBoostRepositoryRepairTarget(job.objective)
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
      })
      if (!execution) {
        await terminalFailure(job, 'builder_repository_repair_target_unavailable')
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
      const repositoryMergePending = payload.repository_merge_pending === true
        || (payload.repository_write_stage === 'pr_created'
          && payload.merge_allowed === true
          && payload.merge_taken !== true
          && Number.isInteger(Number(payload.pull_request_number))
          && Number(payload.pull_request_number) > 0)
      if (!repositoryMergePending) {
        const repositoryCompleted = payload.merge_taken === true && typeof payload.merge_commit_sha === 'string'
        
      }
      return
    }

    // V1 has been retired. Never silently route untagged or legacy debug jobs
    // to the old execution harness (including resumed checkpoint claims).
    // Terminal failure is intentionally safer than replaying a V1 job as V2.
    // The fence sits after the Platform Engineer lane: owner self-healing repair jobs
    // (platformRepair, Vercel-log targets) are repository work with their own harness, not the
    // retired tool loop. Production 2026-10-17: 46 repair jobs in six hours died here untouched.
    if (job.jobKind !== 'standard' || job.metadata.builderEngine !== 'v2') {
      await terminalFailure(job, 'builder_v1_retired_use_v2')
      return
    }

    const workspace = createSupabaseBuilderWorkspace(job.userId)
    if (!workspace) {
      await terminalFailure(job, 'builder_job_storage_unavailable')
      return
    }
    // Conversation continuations may be admitted when their initial file list
    // was transiently empty. The claimed worker must read source again before
    // doing any work: never invent a replacement project from an empty listing.
    if (job.metadata.requiresExistingSource === true) {
      const source = await inspectBuilderContinuationSource({
        hasWorkspace: () => workspace.hasWorkspace(job.workspaceId),
        listPaths: async () => (await workspace.listFiles(job.workspaceId)).map(file => file.path),
      })
      if (source.status !== 'ready') {
        const reason = source.status === 'workspace_missing' ? 'builder_existing_workspace_missing'
          : source.status === 'read_unavailable' ? 'builder_existing_source_read_unavailable'
          : 'builder_existing_source_unavailable'
        await terminalFailure(job, reason)
        return
      }
    }

    const cognitive = await retrieveValidatedCognitiveSkills(job.objective, { specialistFamily: 'software' }).catch(error => {
      console.error('[builder_cognitive_skill_retrieval_failed]', { message: error instanceof Error ? error.message : 'unknown' })
      return emptyCognitiveContext()
    })
    // Open/public retained knowledge is shared with the working Builder immediately. This is
    // reference/RAG context only: it cannot authorize tools, prove current facts, or award University
    // credit. The helper is bounded and fails open so ordinary work is not blocked by retrieval.
    const workingKnowledge = await workingAgentKnowledgeBlock(job.objective, 'builder')
    const priorEpisodes = await retrieveBuilderEpisodes({
      userId: job.userId,
      objective: job.objective,
      excludeConversationId: job.conversationId,
      limit: 4,
    }).catch(error => {
      console.warn('[builder_episode_read_failed]', { jobId, message: error instanceof Error ? error.message : 'unknown' })
      return []
    })
    const episodicKnowledge = formatBuilderEpisodesForPrompt(priorEpisodes)
    const combinedWorkingKnowledge = [workingKnowledge, episodicKnowledge].filter(Boolean).join('\n\n')

    const sliceStartedAtMs = Date.now()
    const deadlineAtMs = Date.now() + BUILDER_JOB_BUDGET_MS
    const ai = createGovernedBuilderAiPort(createBuilderCodingAiPort({ yieldToChat: selfHealingCapacityJob(job) }), {
      deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS,
    })
    const runner = new VercelSandboxBuilderRunner()
    const mcp = createBuilderMcpReadPort({
      tenantId: job.userId,
      userId: job.userId,
      environmentId: process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
      ownerAuthorized: job.ownerAuthorized === true,
    })
    const browserCli = createBuilderPlaywrightCliPort({
      ownerAuthorized: job.ownerAuthorized === true,
    })
    const plan = debugPlan(job)
    const documentationPaths = !plan && isRepairObjective(job.objective)
      ? job.checkpoint ? job.checkpoint.documentationPaths ?? null : await classifyBuilderDocumentationIntent(ai, job.objective) : null
    const priorLessons = plan ? [] : await workspace.fetchProjectRepairSignals(job.workspaceId).catch(() => {
      console.warn('[builder_project_lesson_read_failed]', { jobId })
      return []
    })
    const result = await withBuilderSliceDeadline(() => plan
      ? runDebugFileJob({
          objective: job.objective,
          workspaceId: job.workspaceId,
          plan,
          workspace,
          runner,
          ai,
          cognitiveSkills: cognitive.items,
          workingKnowledge: combinedWorkingKnowledge,
        })
      : new BuilderToolLoop(ai, workspace, runner, mcp, browserCli).run({
          objective: job.objective,
          workspaceId: job.workspaceId,
          priorLessons,
          cognitiveSkills: cognitive.items,
          workingKnowledge: combinedWorkingKnowledge,
          projectContext: job.metadata.projectContext,
          checkpoint: job.checkpoint,
          documentationPaths,
          // Leave room for a slow model round, then a bounded sandbox command and persistence.
          shouldPause: (beforeTool = false) => {
            // Each tool boundary refreshes the generation-fenced watchdog timestamp.
            void heartbeat().catch(() => undefined)
            return Date.now() - sliceStartedAtMs >= (beforeTool ? 150_000 : 100_000)
          },
          maxRounds: 96,
          deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS,
          modelRoundTimeoutMs: 55_000,
        }), BUILDER_SLICE_HARD_DEADLINE_MS)
    await browserCli.close().catch(error => {
      console.warn('[builder_browser_cli_close_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })

    lastTrace = result.trace
    const files = (await workspace.listFiles(job.workspaceId)).map(file => file.path)
    const trace = publicTrace(result.trace)
    // Model capacity is not work: re-queue with this slice's progress before spending a work slice.
    if (result.ok === false && (result.error === 'builder_runpod_primary_busy' || result.error === 'builder_model_round_timeout' || result.error === BUILDER_TURN_TIMEOUT_ERROR)
      && await deferSelfHealingCapacity(job, result.error, trace, result.checkpoint ?? null)) return
    if (result.ok === false && result.checkpoint && builderMayContinue(job, result.checkpoint,
      result.error === 'builder_runpod_primary_busy' || result.error === 'builder_model_round_timeout' || result.error === BUILDER_TURN_TIMEOUT_ERROR)) {
      const reply = historyReply(result.checkpoint.verificationPending
        ? 'Files written — verifying changes. Builder will continue automatically.'
        : 'Builder saved its progress and will continue automatically. Verification is not complete yet.', job.workspaceId, files)
      await pauseBuilderJob({ job, checkpoint: result.checkpoint, reply,
        result: { jobId: job.id, workspaceId: job.workspaceId, status: 'paused', reply, files, trace } })
      return
    }
    // A recorded failing full-suite run is an actionable continuation state, not
    // a completion verdict. Allow a bounded next claim even if this slice only
    // inspected the two failing assertions; the existing generation-fenced RPC
    // and MAX_WORK_SLICES cap prevent unbounded replay.
    const unresolvedSuite = result.ok === false && result.checkpoint &&
      result.trace.some((item, index, events) => item.toolId === 'run' && !item.ok &&
        /(?:npm test|node --test|pnpm test|yarn test)/.test(String(item.input.command || '')) &&
        !events.slice(index + 1).some(next => next.ok &&
          (next.toolId === 'write_file' || next.toolId === 'edit_file' ||
            (next.toolId === 'run' && /(?:npm test|node --test|pnpm test|yarn test)/.test(String(next.input.command || ''))))))
    if (unresolvedSuite && builderMayContinue(job, result.checkpoint!)) {
      const reply = historyReply('Builder identified failing tests and saved the diagnostic evidence. Automatically continuing focused repair; full-suite verification remains required.', job.workspaceId, files)
      await pauseBuilderJob({ job, checkpoint: result.checkpoint!, reply,
        result: { jobId: job.id, workspaceId: job.workspaceId, status: 'paused', reply, files, trace } })
      return
    }
    // Reaching a productive-slice ceiling is not a source failure. Atomically reset the
    // claim generation for a bounded continuation cycle while retaining the same job,
    // objective, workspace, trace and checkpoint. The database enforces age/cycle caps.
    if (result.ok === false && result.checkpoint && builderSliceMadeProgress(job.checkpoint, result.checkpoint)
      && job.claimGeneration >= 24) {
      const reply = historyReply('Builder saved its work and is automatically continuing verification and remaining files.', job.workspaceId, files)
      if (await requeueBuilderContinuationCycle({ job, checkpoint: result.checkpoint, reply,
        result: { jobId: job.id, workspaceId: job.workspaceId, status: 'queued', reply, files, trace } })) return
    }
    const shouldExplain = Boolean(plan) || isRepairObjective(job.objective) || typeof job.metadata.proposalSourceJobId === 'string'
      || trace.some(item => item.toolId === 'run' && !item.ok)
    const initialReply = async (fallback: string, status: string) => shouldExplain
      ? explainInitialBuilderRepair({
          prompt: job.objective,
          job: { ...job, status, result: { files, trace, ...(result.ok === false ? { error: result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error } : {}) } },
          workspace: { readFile: (workspaceId, path) => workspace.readExistingFile(workspaceId, path) },
          ai, fallback, deadlineAtMs: deadlineAtMs - BUILDER_JOB_RESULT_RESERVE_MS,
        })
      : `${fallback}\n\n${formatBuilderExecutionEvidence(trace)}`
    if (result.ok === false) {
      const workLimit = result.checkpoint ? builderWorkLimitReport(job, files) : ''
      const reply = historyReply(await initialReply(`${repairAwareFailureReply(job, result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error, trace)}${workLimit ? `\n\n${workLimit}` : ''}\n\n${builderNextAction(result.error, result.trace)}`, 'failed'), job.workspaceId, files)
      await finishBuilderJob({
        jobId: job.id,
        userId: job.userId,
        claimGeneration: job.claimGeneration,
        status: 'failed',
        reply,
        error: result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error,
        result: {
          jobId: job.id,
          workspaceId: job.workspaceId,
          status: 'failed',
          error: result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error,
          reply,
          files,
          trace,
        },
      })
      
      const terminalError = result.checkpoint ? 'builder_continuation_budget_exhausted' : result.error
      await recordBuilderCompetencyGap({
        jobId: job.id,
        objective: job.objective,
        error: terminalError,
        ownerAuthorized: job.ownerAuthorized === true,
      }).catch(gapError => console.error('[builder_competency_gap_record_failed]', {
        jobId: job.id,
        message: gapError instanceof Error ? gapError.message : 'unknown',
      }))
      await recordBuilderEpisode({
        job,
        outcome: 'failed',
        summary: reply,
        evidence: { error: terminalError, files, verification: 'generation_fenced_terminal_builder_failure' },
      }).catch(() => console.warn('[builder_episode_write_failed]', { jobId }))
      return
    }

    // A smoke command cannot override an unsuccessful required test suite.
    // Verify against the last source revision, not an older passing run.
    const contract = builderTaskContract(builderContractObjective(job.objective, job.metadata.projectContext))
    const verification = builderTaskProgress(contract, files, result.trace)
    const latestSourceChange = result.trace.findLastIndex(item => item.ok &&
      (item.toolId === 'write_file' || item.toolId === 'edit_file'))
    const latestSuite = result.trace.slice(latestSourceChange + 1).filter(item =>
      item.toolId === 'run' && /(?:npm test|node --test|pnpm test|yarn test)/.test(String(item.input.command || ''))).at(-1)
    const suiteUnverified = contract.commands.some(command =>
      /(?:npm test|node --test|pnpm test|yarn test)/.test(command)) &&
      (!latestSuite || latestSuite.ok !== true || (latestSuite.output as { exitCode?: number } | undefined)?.exitCode !== 0)
    if (!verification.satisfied || suiteUnverified) {
      const reply = historyReply('Builder has not passed the required full verification after the latest changes. Saved workspace and diagnostics remain available.', job.workspaceId, files)
      await finishBuilderJob({
        jobId: job.id, userId: job.userId, claimGeneration: job.claimGeneration,
        status: 'failed', reply, error: 'builder_verification_incomplete',
        result: { jobId: job.id, workspaceId: job.workspaceId, status: 'failed',
          error: 'builder_verification_incomplete', reply, files, trace },
      })
      return
    }

    if (verifiedBuilderCognitiveApplication(result)) {
      const successfulRuns = result.trace.filter(item => item.toolId === 'run' && item.ok).length
      await recordAppliedCognitiveSkills(job, cognitive.items.map(item => item.skillKey), successfulRuns)
    }

    const baseReply = !documentationPaths && isRepairObjective(job.objective)
      ? formatBuilderOperatorRepairReply({ ok: true, answer: result.answer, trace })
      : shouldExplain ? 'The job completed. See the recorded verification below.' : result.answer
    const reply = historyReply(await initialReply(baseReply, 'succeeded'), job.workspaceId, files)
    await finishBuilderJob({
      jobId: job.id,
      userId: job.userId,
      claimGeneration: job.claimGeneration,
      status: 'succeeded',
      reply,
      result: {
        jobId: job.id,
        workspaceId: job.workspaceId,
        status: 'succeeded',
        reply,
        files,
        trace,
      },
    })
    
    await recordBuilderEpisode({
      job,
      outcome: 'succeeded',
      summary: reply,
      evidence: { files, successfulRuns: result.trace.filter(item => item.toolId === 'run' && item.ok).length, verification: 'workspace_changed_and_host_command_exit_zero' },
    }).catch(() => console.warn('[builder_episode_write_failed]', { jobId }))
    // Only after the generation-fenced terminal write; learning failure cannot undo task success.
    if (!plan) await workspace.recordJobRepairLesson(job.workspaceId, job.id, job.claimGeneration, result)
      .then(recorded => console.info('[builder_project_lesson_outcome]', { jobId, recorded, retrievedSignals: priorLessons.length }))
      .catch(() => console.warn('[builder_project_lesson_write_failed]', { jobId }))
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
