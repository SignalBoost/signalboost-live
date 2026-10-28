import { assistanceCopy, COLLABORATE_MERGE_HELD } from '../ai/cos/assistanceMode.ts'
import { builderRunSourceEvidence } from './source-evidence.ts'
import { builderPendingWriteEvidence } from './evidence-events.ts'
// lib/builder/repository-repair.ts
import { createBuilderCodingAiPort } from '../cos/aiPort.ts'
import { BUILDER_TURN_TIMEOUT_ERROR, createGovernedBuilderAiPort } from './control-adapter.ts'
import { createBuilderPlaywrightCliPort } from './playwright-cli-port.ts'
import { createRepositoryRepairProofController, discoverRepositoryRepairProofCommand } from './repository-repair-proof-controller.ts'
import { normalizeBuilderSandboxCommand } from './project-context.ts'
import { createSupabaseBuilderWorkspace } from './workspace-supabase.ts'
import { verifiedRepairLesson } from './verified-lessons.ts'
import { inferBuilderCertificationAttempt } from './certification.ts'
import { parseSignalBoostRepositoryRepairTarget, resolveSignalBoostRepositoryCommit, signalBoostRepositoryRepairObjective, type SignalBoostRepositoryRepairTarget } from './repository-repair-target.ts'
import { publishSignalBoostRepositoryRepair } from './repository-repair-writeback.ts'
import { attemptSignalBoostRepositoryAutoMerge, type AutoMergeResult } from './repository-repair-automerge.ts'
import { watchMergedDeployment, type MergeWatchResult } from './repository-merge-watch.ts'
import { createSupabaseMergeWatchStore } from './merge-watch-store.ts'
import { VercelRepositoryRepairSession } from './vercel-repository-repair-session.ts'
import type { BuilderRunResult, BuilderRunnerPort, BuilderToolTrace } from './contracts.ts'
import { BuilderV2Agent } from './agent-v2.ts'
import { BuilderV2Dispatcher, type BuilderV2Receipt } from './agent-v2-dispatcher.ts'
import { runBuilderV2JobCycle } from './agent-v2-job-cycle.ts'
import { BUILDER_SLICE_MAX_STEPS } from './work-budget.ts'
import { isRepositoryRepairCheckpoint, repositoryEditCopyPath, repositoryRepairLeaseStore, repositoryRepairTraceFromReceipts, repositoryRepairV2Objective, restoreRepositoryRepairCheckout, type RepositoryRepairCheckpoint } from './repository-repair-v2.ts'
import type { StateSnapshotPort } from '@/lib/portable/state-snapshot-port'
import { builderNodeTestCommand } from './node-test-command.ts'

export type SignalBoostRepositoryRepairExecution = Readonly<{
  status: number
  payload: Record<string, unknown>
  /** The slice ended with the repair unfinished; the job pauses with this checkpoint and a later slice resumes it. */
  paused?: Readonly<{ checkpoint: RepositoryRepairCheckpoint; reason: string; steps: readonly BuilderV2Receipt[] }>
  /** Another claim owns the job; this slice must write nothing. */
  lostLease?: true
}>

/** The durable job this slice runs for: its fenced checkpoint write and the checkpoint a previous slice saved. */
export type RepositoryRepairContinuation = Readonly<{
  jobId: string
  claimGeneration: number
  checkpoint: RepositoryRepairCheckpoint | null
  persist: (checkpoint: RepositoryRepairCheckpoint) => Promise<boolean>
}>

const DEFAULT_REPOSITORY_REQUEST_BUDGET_MS = 250_000

// Auto-merge is OFF unless the environment says otherwise, explicitly and exactly.
// Any other value — unset, empty, '1', 'yes' — leaves the lane PR-only.
function autoMergeEnabled(): boolean {
  return String(process.env.BUILDER_AUTO_MERGE_ENABLED || '').trim().toLowerCase() === 'true'
}
const REPOSITORY_RESULT_RESERVE_MS = 45_000
const BUILDER_RESULT_TEXT_PATH = 'builder-result.txt'

function publicTrace(trace: readonly BuilderToolTrace[]) {
  return trace.map(({ round, toolId, ok, input, output, error, failureClass, remediation }) => {
    const base = { round, toolId, ok, ...(error ? { error } : {}), ...(failureClass ? { failureClass } : {}), ...(remediation ? { remediation } : {}) }
    if (toolId === 'browser_cli') {
      const result = output && typeof output === 'object' ? output as Record<string, unknown> : {}
      return {
        ...base,
        action: typeof input.action === 'string' ? input.action.slice(0, 80) : '',
        ...(typeof result.exitCode === 'number' ? { exitCode: result.exitCode } : {}),
        ...(typeof result.stdout === 'string' ? { stdout: result.stdout.slice(0, 16_000) } : {}),
        ...(typeof result.stderr === 'string' ? { stderr: result.stderr.slice(0, 16_000) } : {}),
        ...(typeof result.timedOut === 'boolean' ? { timedOut: result.timedOut } : {}),
        ...(typeof result.failureCode === 'string' ? { failureCode: result.failureCode.slice(0, 120) } : {}),
      }
    }
    if (toolId !== 'run') return { ...base, ...builderPendingWriteEvidence(output), ...(typeof input.path === 'string' ? { path: input.path.slice(0, 240) } : {}) }
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

/** A host-run proof, in the trace shape the evidence consumers read. */
function proofTrace(round: number, command: string | null, result: BuilderRunResult): BuilderToolTrace {
  const ok = result.exitCode === 0 && !result.timedOut
  return Object.freeze({
    round, toolId: 'run', input: { command: command || '' }, ok, output: result,
    ...(ok ? {} : { error: result.timedOut ? 'builder_test_timeout' : 'builder_tests_failed' }),
    ...(!ok && !result.timedOut ? { failureClass: 'test' as const } : {}),
  })
}

function failedPayload(input: {
  error: string
  workspaceId: string
  files: readonly string[]
  trace: readonly BuilderToolTrace[]
  baseCommitSha: string | null
}): SignalBoostRepositoryRepairExecution {
  return Object.freeze({
    status: input.error === BUILDER_TURN_TIMEOUT_ERROR ? 504 : 422,
    payload: {
      error: input.error,
      source: 'cos-platform-engineer',
      workspaceId: input.workspaceId,
      files: input.files,
      trace: publicTrace(input.trace),
      execution_allowed: true,
      repository_write_allowed: false,
      repository_write_taken: false,
      merge_allowed: false,
      deployment_allowed: false,
      base_commit_sha: input.baseCommitSha,
    },
  })
}

function requestDeadline(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : Date.now() + DEFAULT_REPOSITORY_REQUEST_BUDGET_MS
}

function recordedBuildProofCommand(target: SignalBoostRepositoryRepairTarget): string | null {
  const failedCommand = String(target.failedCommand || '').trim()
  if (!failedCommand) return null
  if (/vercel-cos-gates|npm run prebuild|next build|check-cos-blueprint/i.test(failedCommand)) return failedCommand
  return null
}

function targetedRepositoryCommand(command: string, target: SignalBoostRepositoryRepairTarget): string {
  const normalized = normalizeBuilderSandboxCommand(command)
  const failingTests = target.pathHints
    .map(path => path.replace(/^saas\//, ''))
    .filter(path => /^(?:tests|test)\/.+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/i.test(path))
    .slice(0, 4)
  // The SignalBoost npm test script enumerates the entire suite and can OOM the 2-vCPU repair
  // sandbox. If the failed build identified exact tests, never allow a broad npm test to replace
  // that evidence; execute those tests directly even if the model asked for the broad script.
  if (failingTests.length > 0 && /^npm\s+(?:run\s+)?test(?:\s|$)/i.test(normalized)) {
    return builderNodeTestCommand(failingTests.join(' '))
  }
  const recordedProof = recordedBuildProofCommand(target)
  // When the log has no failing test file, the recorded Vercel gate/prebuild command is the proof.
  // Do not let the model substitute an unrelated unit test.
  if (!failingTests.length && recordedProof && !/vercel-cos-gates|prebuild|next build|check-cos-blueprint/i.test(normalized)) {
    return recordedProof
  }
  return normalized
}

function productionAcceptanceContract(target: SignalBoostRepositoryRepairTarget, result: { trace: readonly BuilderToolTrace[] }): { url: string; expectedText: string } | null {
  // Only browser evidence observed during the verified repair may authorize a later Production
  // assertion. Never invent acceptance text from the model answer or fall back to a homepage smoke.
  const browser = [...result.trace].reverse().find(item => item.toolId === 'browser_cli' && item.ok && item.output && typeof item.output === 'object')
  const output = browser?.output as Record<string, unknown> | undefined
  const stdout = typeof output?.stdout === 'string' ? output.stdout.replace(/\s+/g, ' ').trim() : ''
  const expectedText = stdout.slice(0, 240)
  if (!expectedText) return null
  return { url: 'https://itmounts.com/', expectedText }
}

function isBroadRepositoryTestCommand(command: string): boolean {
  const normalized = normalizeBuilderSandboxCommand(command)
  return /^npm\s+(?:run\s+)?test(?:\s*(?:2?>&?1)?\s*\|.*)?$/i.test(normalized)
}

export async function executeSignalBoostRepositoryRepair(input: {
  userId: string
  ownerAuthorized: boolean
  rawObjective: string
  workspaceId: string
  deadlineAtMs?: number
  target?: SignalBoostRepositoryRepairTarget
  /**
   * Injected checkpoint port for auto-merge. Absent means no checkpoint, which
   * attemptSignalBoostRepositoryAutoMerge refuses on — the lane stays PR-only.
   */
  snapshotPort?: StateSnapshotPort | null
  /** Work with me: create the pull request but never merge it; the owner reviews and merges. */
  holdMerge?: boolean
  responseLanguage?: unknown
  continuation: RepositoryRepairContinuation
}): Promise<SignalBoostRepositoryRepairExecution | null> {
  const resumeState = input.continuation.checkpoint && isRepositoryRepairCheckpoint(input.continuation.checkpoint)
    ? input.continuation.checkpoint.repositoryRepair : null
  if (input.ownerAuthorized !== true) {
    return Object.freeze({
      status: 403,
      payload: {
        error: 'builder_repository_repair_owner_required',
        source: 'cos-platform-engineer',
        workspaceId: input.workspaceId,
        execution_allowed: false,
        repository_write_allowed: false,
        repository_write_taken: false,
        merge_allowed: false,
        deployment_allowed: false,
      },
    })
  }
  const parsed = input.target ?? parseSignalBoostRepositoryRepairTarget(input.rawObjective)
  if (!parsed) return null
  const target = await resolveSignalBoostRepositoryCommit(parsed)
  const workspace = createSupabaseBuilderWorkspace(input.userId)
  if (!workspace) return Object.freeze({ status: 503, payload: { error: 'Builder storage is unavailable.' } })

  const deadlineAtMs = requestDeadline(input.deadlineAtMs)
  const objective = signalBoostRepositoryRepairObjective(target)
  await workspace.ensureWorkspace(input.workspaceId)
  await workspace.setObjective(input.workspaceId, objective)

  if (Date.now() >= deadlineAtMs - REPOSITORY_RESULT_RESERVE_MS) {
    return failedPayload({
      error: BUILDER_TURN_TIMEOUT_ERROR,
      workspaceId: input.workspaceId,
      files: [],
      trace: [],
      baseCommitSha: target.fullCommitSha,
    })
  }

  let session: VercelRepositoryRepairSession | null = null
  const browserCli = createBuilderPlaywrightCliPort({ ownerAuthorized: input.ownerAuthorized })
  try {
    const setupStartedAtMs = Date.now()
    session = await VercelRepositoryRepairSession.create(target, { deadlineAtMs })
    const setupDurationMs = Date.now() - setupStartedAtMs
    console.info('[builder_repository_setup_timing]', {
      setupDurationMs,
      remainingExecutionMs: Math.max(0, deadlineAtMs - Date.now() - REPOSITORY_RESULT_RESERVE_MS),
    })
    const aiDeadlineAtMs = deadlineAtMs - REPOSITORY_RESULT_RESERVE_MS
    if (Date.now() >= aiDeadlineAtMs) {
      return failedPayload({
        error: BUILDER_TURN_TIMEOUT_ERROR,
        workspaceId: input.workspaceId,
        files: [],
        trace: [],
        baseCommitSha: target.fullCommitSha,
      })
    }

    // Platform Engineer has its own persistent repository runner rather than the ordinary Builder
    // sandbox runner. Apply the same command normalization here and force exact failed-test targets
    // when available so a broad npm test cannot OOM the repository sandbox.
    const repositoryRunner: BuilderRunnerPort = {
      stagesWorkspaceFiles: false,
      run: runInput => {
        const command = targetedRepositoryCommand(runInput.command, target)
        if (isBroadRepositoryTestCommand(command)) {
          return Promise.resolve(Object.freeze({
            exitCode: 125,
            stdout: '',
            stderr: 'builder_repository_broad_test_blocked: select the smallest relevant test file and run it directly; the complete repository suite runs later in PR CI',
            timedOut: false,
            executedCommand: command,
          }))
        }
        return session!.run({ ...runInput, command })
      },
    }

    // The repository sandbox is ephemeral. Persist every successful model-issued edit before
    // returning the tool receipt; a continuation replays these copies into its fresh checkout.
    // Keep the underlying session's methods bound to preserve its private state.
    const editedPaths = new Set<string>(resumeState?.editedPaths ?? [])
    const durableSession = new Proxy(session, {
      get(target, key, receiver) {
        if (key === 'writeFile' || key === 'editFile') {
          return async (...args: string[]) => {
            const result = key === 'writeFile'
              ? await target.writeFile(args[0], args[1], args[2])
              : await target.editFile(args[0], args[1], args[2], args[3])
            await workspace.writeFile(input.workspaceId, repositoryEditCopyPath(result.path), result.content)
            editedPaths.add(result.path)
            return result
          }
        }
        const value = Reflect.get(target, key, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    // A continuation rebuilds the paused checkout: same pinned commit, same visible files, every edit replayed.
    if (resumeState) {
      await restoreRepositoryRepairCheckout({ checkout: session, copies: workspace, workspaceId: input.workspaceId, state: resumeState })
    }

    const governedAi = createGovernedBuilderAiPort(createBuilderCodingAiPort(), { deadlineAtMs: aiDeadlineAtMs })
    const engineeringTask = target.trigger === 'deployed_platform_engineering'
    // Repairs keep the host-owned fail-before/change/pass-after proof. With no host-selected proof the
    // controller pins the first failing test/typecheck/build the agent runs, so a plain-language report
    // is investigated and reproduced instead of being refused before any command. Owner-authorized
    // feature/implementation work has no legitimate failing baseline to manufacture, so it runs on the
    // same repository checkout and runner but must still change source and pass fresh verification.
    // A deployed-platform task with explicit failing-test evidence is a repair, not a greenfield feature.
    const engineeringRepair = engineeringTask
      && (
        target.pathHints.some(path => /^(?:saas\/)?tests?\/.+\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path))
        || target.failureEvidence.some(line => /(?:saas\/)?tests?\/[A-Za-z0-9_.\/-]+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)/i.test(line))
      )
      && target.failureEvidence.some(line => /(?:assertionerror|failed|not ok|exit code|error:)/i.test(line))
    // The proof decision is not a wording rule: whenever the host can name the check from the request (a test file
    // named anywhere in it, the recorded failing command, or an unambiguous source/test pair), the host runs that check
    // first and its result decides. Production 2026-10-28 (job 5f60d618): an owner request naming a test file was
    // classed as engineering work, so no host check ran, the model picked its own passing test and the job ended with
    // nothing to show. A passing host check ends such a request as not reproduced with no model spend.
    let selectedProofCommand: string | null = null
    if (!resumeState) {
      const namedTests = [...String(target.rawLog || '').matchAll(/(?:saas\/)?tests?\/[A-Za-z0-9_.\/-]+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)/g)]
        .map(match => match[0]).filter(path => !path.includes('..'))
      const proofTarget = { ...target, pathHints: [...new Set([...target.pathHints, ...namedTests])] }
      selectedProofCommand = discoverRepositoryRepairProofCommand(proofTarget, (await durableSession.listFiles(input.workspaceId)).map(file => file.path))
    }
    const needsRepairProof = resumeState ? resumeState.proof !== null : !engineeringTask || engineeringRepair || selectedProofCommand !== null
    if (needsRepairProof && !resumeState) {
      if (!selectedProofCommand && typeof durableSession.searchFiles === 'function') {
        // The reported failure may name a symbol or diagnostic but not its test path.
        // Search actual repository contents; do not pick an arbitrary passing suite.
        const terms = [...target.symbolHints, ...target.failureEvidence.flatMap(line =>
          [...line.matchAll(/\b(?:builder|cos|workspace|repository)_[a-z][a-z0-9_]{5,100}\b/g)].map(match => match[0]))]
          .filter(term => term.length >= 8).slice(0, 4)
        const matches = new Set<string>()
        for (const term of terms) {
          const found = await durableSession.searchFiles(input.workspaceId, term)
          for (const path of found) {
            const candidate = path.replace(/^saas\//, '')
            if (/^(?:tests|test)\/.+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/i.test(candidate)) matches.add(candidate)
          }
        }
        if (matches.size === 1) selectedProofCommand = builderNodeTestCommand([...matches][0])
      }
    }
    const proofController = needsRepairProof ? createRepositoryRepairProofController({
      workspace: durableSession,
      runner: repositoryRunner,
      proofCommand: selectedProofCommand,
      state: resumeState?.proof ?? null,
    }) : null

    // The host runs the selected proof on the untouched revision before any model call: a defect that does not
    // reproduce is not repaired, and nothing is spent on it.
    if (proofController && !resumeState) {
      const baseline = await proofController.baseline(input.workspaceId)
      if (baseline.state === 'passed' || baseline.state === 'invalid') {
        return failedPayload({
          error: baseline.state === 'passed' ? 'builder_regression_not_reproduced' : 'builder_regression_evidence_required',
          workspaceId: input.workspaceId,
          files: (await workspace.listFiles(input.workspaceId)).map(file => file.path),
          trace: baseline.result ? [proofTrace(1, proofController.proofCommand, baseline.result)] : [],
          baseCommitSha: target.fullCommitSha,
        })
      }
    }

    const agentObjective = resumeState?.objective ?? repositoryRepairV2Objective(objective, proofController?.proofCommand ?? null)
    const agentWorkspace = proofController?.workspace ?? durableSession
    const agent = new BuilderV2Agent(governedAi, new BuilderV2Dispatcher(agentWorkspace, proofController?.runner ?? repositoryRunner, undefined, browserCli), agentWorkspace)
    const store = repositoryRepairLeaseStore({
      jobId: input.continuation.jobId,
      claimGeneration: input.continuation.claimGeneration,
      workspaceId: input.workspaceId,
      objective: agentObjective,
      checkpoint: input.continuation.checkpoint,
      repositoryState: () => ({
        objective: agentObjective,
        visiblePaths: session!.visibleFiles(),
        editedPaths: [...editedPaths],
        proof: proofController?.state() ?? null,
      }),
      persist: input.continuation.persist,
    })
    // The slice ends before the result reserve, so a paused repair still has time to save its checkpoint.
    const sliceController = new AbortController()
    const sliceTimer = setTimeout(() => sliceController.abort(new Error('builder_repository_repair_slice_deadline')),
      Math.max(0, aiDeadlineAtMs - Date.now()))
    sliceTimer.unref?.()
    const cycle = await runBuilderV2JobCycle({
      jobId: input.continuation.jobId,
      claimGeneration: input.continuation.claimGeneration,
      store,
      agent,
      maxSteps: BUILDER_SLICE_MAX_STEPS,
      signal: sliceController.signal,
    }).finally(() => clearTimeout(sliceTimer))
    const steps = cycle.result?.steps ?? []
    const trace = repositoryRepairTraceFromReceipts(steps)
    const filesNow = async () => (await workspace.listFiles(input.workspaceId)).map(file => file.path)

    if (cycle.status === 'lost_lease') return Object.freeze({ status: 409, payload: { error: 'builder_v2_claim_stale', source: 'cos-platform-engineer' }, lostLease: true })
    if (cycle.status === 'paused') {
      const checkpoint = store.lastSaved()
      if (!checkpoint) {
        return failedPayload({ error: 'builder_repository_repair_checkpoint_unsaved', workspaceId: input.workspaceId, files: await filesNow(), trace, baseCommitSha: target.fullCommitSha })
      }
      return Object.freeze({
        status: 202,
        payload: { source: 'cos-platform-engineer', workspaceId: input.workspaceId, files: await filesNow(), trace: publicTrace(trace), base_commit_sha: target.fullCommitSha },
        paused: { checkpoint, reason: cycle.reason, steps },
      })
    }
    if (cycle.status === 'failed') {
      return failedPayload({ error: cycle.reason, workspaceId: input.workspaceId, files: await filesNow(), trace, baseCommitSha: target.fullCommitSha })
    }

    // Verified by the agent. The repair counts only when the host's own proof run passes on the final source.
    if (proofController) {
      const final = await proofController.finalProof(input.workspaceId)
      if (final.result) trace.push(proofTrace(trace.length + 1, proofController.proofCommand, final.result))
      if (!final.passed) {
        return failedPayload({
          error: proofController.proofCommand ? 'builder_regression_proof_failed_after_change' : 'builder_regression_not_reproduced',
          workspaceId: input.workspaceId, files: await filesNow(), trace, baseCommitSha: target.fullCommitSha,
        })
      }
    }
    const result = { ok: true as const, answer: String(cycle.result?.summary || 'Repository repair verified.'), trace }

    const acceptanceContract = productionAcceptanceContract(target, result)
    const changes = await session.collectChanges()
    const patchPresent = Boolean(changes.patch.trim())
    if (patchPresent) await workspace.writeFile(input.workspaceId, 'repository-repair.patch', changes.patch)
    for (const file of changes.files) await workspace.writeFile(input.workspaceId, repositoryEditCopyPath(file.path), file.content)
    let files = await filesNow()
    if (!patchPresent) {
      return failedPayload({
        error: 'builder_repository_repair_produced_no_patch',
        workspaceId: input.workspaceId,
        files,
        trace: result.trace,
        baseCommitSha: target.fullCommitSha,
      })
    }

    // A verified repository repair must always leave the owner a plain-text
    // deliverable before any repository mutation is attempted. This prevents a
    // successful code repair from collapsing into narration-only delivery.
    await workspace.writeFile(input.workspaceId, BUILDER_RESULT_TEXT_PATH, `${result.answer.trim()}\n`)
    files = (await workspace.listFiles(input.workspaceId)).map(file => file.path)

    const lesson = verifiedRepairLesson(result)
    if (lesson) await workspace.recordVerifiedRepairLesson(input.workspaceId, lesson).catch(error => {
      console.error('[builder_repository_lesson_write_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })
    const certification = inferBuilderCertificationAttempt(result)
    if (certification) await workspace.recordCertificationAttempt(input.workspaceId, certification).catch(error => {
      console.error('[builder_repository_certification_write_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    })
    const writeback = await publishSignalBoostRepositoryRepair({
      target,
      workspaceId: input.workspaceId,
      files: changes.files,
      patch: changes.patch,
      holdMerge: input.holdMerge === true,
    })
    // Auto-merge is attempted ONLY on a real published PR, only behind the env flag, and it
    // refuses itself on a danger category or a missing/unrestorable checkpoint. A refusal here
    // changes nothing: the PR stays open for human review, exactly as before.
    let autoMerge: AutoMergeResult | null = null
    if (autoMergeEnabled() && input.holdMerge !== true && writeback.stage === 'pr_created' && writeback.pullRequestNumber) {
      autoMerge = await attemptSignalBoostRepositoryAutoMerge({
        files: changes.files,
        patch: changes.patch,
        pullRequestNumber: writeback.pullRequestNumber,
        snapshotPort: input.snapshotPort ?? null,
      }).catch(error => {
        console.error('[builder_repository_automerge_failed]', { message: error instanceof Error ? error.message : 'unknown' })
        return null
      })
    }
    // A merge that is never looked at is the whole risk. Watch the deployment it produced and
    // roll back on failure — bounded by whatever request budget is left, and reporting an
    // honest "unresolved" rather than rolling back on a merely slow build.
    let mergeWatch: MergeWatchResult | null = null
    if (autoMerge?.merged && autoMerge.mergeCommitSha && autoMerge.preMergeSnapshotId) {
      mergeWatch = await watchMergedDeployment({
        mergeCommitSha: autoMerge.mergeCommitSha,
        preMergeSnapshotId: autoMerge.preMergeSnapshotId,
        snapshotPort: input.snapshotPort ?? null,
        projectId: process.env.VERCEL_PROJECT_ID || '',
        teamId: process.env.VERCEL_TEAM_ID || undefined,
        token: process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN || '',
        deadlineAtMs,
      })
      // READY is only deployment evidence. Main-branch repairs remain pending until the durable
      // worker also runs Playwright against the live Production domain. This prevents Builder
      // from reporting "fixed" after build/deploy alone.
      if (mergeWatch.outcome === 'unresolved' || (target.branch === 'main' && mergeWatch.outcome === 'healthy')) {
        const store = createSupabaseMergeWatchStore()
        if (!store) throw new Error('builder_merge_watch_storage_unavailable')
        await store.record({
          workspaceId: input.workspaceId,
          userId: input.userId,
          mergeCommitSha: autoMerge.mergeCommitSha,
          preMergeSnapshotId: autoMerge.preMergeSnapshotId,
          pullRequestNumber: writeback.pullRequestNumber ?? null,
          acceptanceUrl: acceptanceContract?.url ?? null,
          acceptanceExpectedText: acceptanceContract?.expectedText ?? null,
        })
      }
    }

    const autoMergeReply = !autoMerge
      ? ''
      : autoMerge.merged
        ? ` It was then auto-merged as ${autoMerge.mergeCommitSha}, with deployment ${autoMerge.preMergeSnapshotId} captured beforehand as the rollback target.${mergeWatch ? ` ${mergeWatch.detail}` : ''}`
        : ` Auto-merge was attempted and refused (${autoMerge.reason}): ${autoMerge.detail} The pull request remains open for review.`

    const writebackReply = writeback.stage === 'pr_created' && writeback.pullRequestNumber
      ? `A governed review branch ${writeback.branch} and PR #${writeback.pullRequestNumber} were created from pinned commit ${target.fullCommitSha}. The agent did not merge or deploy it.`
      : writeback.repositoryWriteTaken
        ? `A verified patch was created from pinned commit ${target.fullCommitSha}, and repository write-back began but stopped after ${writeback.stage}${writeback.commitSha ? ` at commit ${writeback.commitSha}` : ''}${writeback.branch ? ` on branch ${writeback.branch}` : ''}${writeback.error ? ` (${writeback.error})` : ''}. Nothing was merged or deployed.`
        : `A reviewable patch was created from pinned commit ${target.fullCommitSha}. Repository write-back was not taken${writeback.error ? ` (${writeback.error})` : ''}. Nothing was merged or deployed.`

    const heldReply = input.holdMerge === true && writeback.stage === 'pr_created' && writeback.pullRequestNumber
      ? ` ${assistanceCopy(COLLABORATE_MERGE_HELD, input.responseLanguage)}` : ''
    const finalReply = `${result.answer}\n\n${writebackReply}${autoMergeReply}${heldReply}`.trim()
    try {
      await workspace.writeFile(input.workspaceId, BUILDER_RESULT_TEXT_PATH, `${finalReply}\n`)
      files = (await workspace.listFiles(input.workspaceId)).map(file => file.path)
    } catch (error) {
      // The pre-write above already guarantees a TXT artifact existed before any
      // repository mutation. Preserve the real writeback/merge outcome if the
      // post-action enrichment cannot update that artifact.
      console.error('[builder_result_artifact_finalize_failed]', { message: error instanceof Error ? error.message : 'unknown' })
    }

    return Object.freeze({
      status: 200,
      payload: {
        source: 'cos-platform-engineer',
        workspaceId: input.workspaceId,
        reply: finalReply,
        files,
        trace: publicTrace(result.trace),
        execution_allowed: true,
        repository_write_allowed: writeback.repositoryWriteAllowed,
        repository_write_taken: writeback.repositoryWriteTaken,
        repository_write_stage: writeback.stage,
        repository_write_error: writeback.error,
        merge_allowed: autoMergeEnabled(),
        merge_taken: Boolean(autoMerge?.merged),
        merge_refused_reason: autoMerge && !autoMerge.merged ? autoMerge.reason : null,
        merge_commit_sha: autoMerge?.mergeCommitSha ?? null,
        pre_merge_snapshot_id: autoMerge?.preMergeSnapshotId ?? null,
        merge_watch_outcome: mergeWatch?.outcome ?? null,
        repository_merge_pending: Boolean(
          autoMerge?.merged
          && target.branch === 'main'
          && mergeWatch?.outcome !== 'rolled_back'
        ),
        production_acceptance_required: Boolean(autoMerge?.merged && target.branch === 'main'),
        production_acceptance_passed: false,
        production_acceptance_url: acceptanceContract?.url ?? null,
        production_acceptance_expected_text: acceptanceContract?.expectedText ?? null,
        merge_watch_deployment_id: mergeWatch?.deploymentId ?? null,
        merge_watch_deployment_state: mergeWatch?.deploymentState ?? null,
        deployment_allowed: false,
        base_commit_sha: target.fullCommitSha,
        branch: target.branch,
        repair_branch: writeback.branch,
        repair_commit_sha: writeback.commitSha,
        pull_request_number: writeback.pullRequestNumber,
        // Work with me: the PR exists and its merge is held for the owner's approval (shown as an approval card in chat).
        ...(input.holdMerge === true && writeback.stage === 'pr_created' && writeback.pullRequestNumber
          ? { awaitingApproval: { action: 'repository_merge', pullRequestNumber: writeback.pullRequestNumber } } : {}),
        pull_request_url: writeback.pullRequestUrl,
      },
    })
  } finally {
    await Promise.all([
      session?.close(),
      browserCli.close().catch(error => {
        console.warn('[builder_repository_browser_cli_close_failed]', {
          message: error instanceof Error ? error.message : 'unknown',
        })
      }),
    ])
  }
}
