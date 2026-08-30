import type { BuilderAiPort, BuilderFailureClass, BuilderFile, BuilderLoopResult, BuilderRunResult, BuilderRunnerPort, BuilderToolId, BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'
import { evaluateRegressionGate, isRepairObjective } from './regression-gate.ts'
import { formatVerifiedLessonsForPrompt } from './verified-lessons.ts'

type Action = { type: 'tool'; toolId: BuilderToolId; input: Record<string, unknown> } | { type: 'answer'; answer: string }
const tools: readonly BuilderToolId[] = Object.freeze(['list_files', 'read_file', 'write_file', 'edit_file', 'run'])
const MAX_WRITES_PER_TURN = 6
const MAX_RUNS_PER_TURN = 3
const MAX_GATE_NUDGES = 3
const MAX_REPEAT_RECOVERY_ATTEMPTS = 4
const MAX_MODEL_ROUND_ATTEMPTS = 2
const text = (value: unknown) => typeof value === 'string' ? value : ''
const safeJson = (value: unknown) => { try { return JSON.stringify(value).slice(0, 18_000) } catch { return '"[unserializable]"' } }

async function within<T>(work: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return work
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('builder_model_round_timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function generateWithRetry(ai: BuilderAiPort, input: Parameters<BuilderAiPort['generate']>[0], timeoutMs?: number): Promise<string | null> {
  let lastError: unknown
  for (let modelAttempt = 1; modelAttempt <= MAX_MODEL_ROUND_ATTEMPTS; modelAttempt += 1) {
    try {
      return await within(ai.generate(input), timeoutMs)
    } catch (error) {
      lastError = error
      if (!(error instanceof Error && error.message === 'builder_model_round_timeout') || modelAttempt === MAX_MODEL_ROUND_ATTEMPTS) throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('builder_model_call_failed')
}

function toolPath(input: Record<string, unknown>): string {
  return text(input.path) || text(input.filePath) || text(input.filename) || text(input.file) || text(input.name)
}

function toolContent(input: Record<string, unknown>): string {
  return text(input.content) || text(input.contents) || text(input.code) || text(input.text)
}

function parse(value: string | null, allowedTools: readonly BuilderToolId[] = tools): Action | null {
  try {
    const parsed = JSON.parse(String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    if (parsed?.type === 'answer' && typeof parsed.answer === 'string') return { type: 'answer', answer: parsed.answer }
    if (parsed?.type === 'tool' && allowedTools.includes(parsed.toolId) && parsed.input && typeof parsed.input === 'object' && !Array.isArray(parsed.input)) return { type: 'tool', toolId: parsed.toolId, input: parsed.input }
  } catch {}
  return null
}

function summarize(file: { path: string; content: string; updatedAt: number }) { return { path: file.path, bytes: new TextEncoder().encode(file.content).byteLength, updatedAt: file.updatedAt } }
function summarizeRun(result: BuilderRunResult) { return { exitCode: result.exitCode, stdout: result.stdout.slice(0, 16_000), stderr: result.stderr.slice(0, 16_000), timedOut: result.timedOut } }

function diagnose(value: unknown): { failureClass: BuilderFailureClass; remediation: string } {
  const message = String(value || '').toLowerCase()
  if (/supabase|postgres|database|constraint|pgrst|duplicate key|relation .* does not exist/.test(message)) return { failureClass: 'storage', remediation: 'Inspect the exact database error and the storage contract before retrying.' }
  if (/cannot find package|no module named|unable to resolve|npm err|dependency|lockfile/.test(message)) return { failureClass: 'dependency', remediation: 'Inspect the dependency manifest and installed runtime before changing source.' }
  if (/cannot find module\\s+['"](?![./])[^'"]+['"]/.test(message)) return { failureClass: 'dependency', remediation: 'Inspect the dependency manifest and installed runtime before changing source.' }
  if (/invalid_path|not found|no such file|module_not_found|cannot find module|enoent|path/.test(message)) return { failureClass: 'path', remediation: 'List or read the workspace files, then use a verified relative path.' }
  if (/node.*not found|command not found|runtime|timed out|timeout|sigkill/.test(message)) return { failureClass: 'runtime', remediation: 'Inspect the runtime evidence and choose an available command; do not guess environment capabilities.' }
  if (/assert|expected|test|exit [1-9]|exit code [1-9]|syntaxerror|typeerror|referenceerror/.test(message)) return { failureClass: 'test', remediation: 'Read the failure output, make the smallest targeted change, then rerun the relevant test.' }
  if (/deploy|vercel|build|compile|production|preview/.test(message)) return { failureClass: 'deployment', remediation: 'Inspect the build or deployment evidence; do not treat local success as deployment proof.' }
  return { failureClass: 'unknown', remediation: 'Inspect the exact failure evidence before making another change.' }
}

export class BuilderToolLoop {
  private readonly ai: BuilderAiPort
  private readonly workspace: BuilderWorkspacePort
  private readonly runner: BuilderRunnerPort

  constructor(ai: BuilderAiPort, workspace: BuilderWorkspacePort, runner: BuilderRunnerPort) {
    this.ai = ai
    this.workspace = workspace
    this.runner = runner
  }

  async run(input: { objective: string; workspaceId: string; maxRounds?: number; modelRoundTimeoutMs?: number; priorLessons?: readonly import('./contracts.ts').BuilderVerifiedRepairLesson[] }): Promise<BuilderLoopResult> {
    const trace: BuilderToolTrace[] = []
    const inspectedInCurrentWorkspaceState = new Set<string>()
    const initialPaths = new Set((await this.workspace.listFiles(input.workspaceId)).map(file => file.path))
    const repairObjective = isRepairObjective(input.objective)
    let writeCount = 0, runCount = 0, gateNudges = 0
    const maxRounds = Math.max(1, Math.min(input.maxRounds ?? 8, 12))
    let workRounds = 0
    let attempt = 0
    while (workRounds < maxRounds && attempt < maxRounds + MAX_REPEAT_RECOVERY_ATTEMPTS) {
      attempt += 1
      const round = attempt
      const lastTrace = trace.at(-1)
      const blockedTool = lastTrace?.error?.startsWith('builder_repeated_tool_call:')
        ? lastTrace.toolId
        : null
      const repairNeedsChange = repairObjective && !trace.some(item => item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))
      const inspectedSource = repairNeedsChange
        ? [...trace].reverse().find(item => item.ok && item.toolId === 'read_file' && toolPath(item.input))
        : undefined
      const availableTools = (blockedTool ? tools.filter(toolId => toolId !== blockedTool) : tools)
        .filter(toolId => !inspectedSource || (toolId !== 'list_files' && toolId !== 'read_file'))
      let response: string | null
      try {
        response = await generateWithRetry(this.ai, {
        systemPrompt: `You are COS Builder. Work only inside the supplied user workspace. Use tools to inspect, edit and run code. You have at most ${MAX_WRITES_PER_TURN} successful file writes/edits and ${MAX_RUNS_PER_TURN} successful command runs. The execution runtime is node24, ephemeral and network-denied. Never claim a file was changed or code ran unless the tool result in this turn proves it. On failure, first classify it as storage, path, runtime, dependency, test, or deployment; read the exact evidence and then choose the smallest next diagnostic or repair. Failed attempts do not consume the successful write/run budget. For a repair objective, do not declare success until a regression test has failed before the repair and passed after it. Use an existing reproducing test when available; otherwise add one. Normal file-creation tasks only require their requested successful proving command. Never access host files, secrets, repositories, networks, deployments or credentials. Return exactly one JSON control object.`,
        prompt: [
          formatVerifiedLessonsForPrompt(input.priorLessons || [], [...trace].reverse().find(item => !item.ok && item.failureClass)?.failureClass || null),
          `OBJECTIVE:\n${input.objective}`,
          `TOOLS: ${safeJson(availableTools)}`,
          trace.length ? `RESULTS:\n${safeJson(trace)}` : '',
          'For file tools, input MUST be {"path":"relative/file.ext","content":"..."}. Do not use file, filename, filePath, code, or contents keys.',
          availableTools.includes('read_file')
            ? 'Use: {"type":"tool","toolId":"read_file","input":{"path":"..."}}'
            : 'Do not request read_file in this round; it is unavailable until the workspace changes.',
          'After inspecting a file, the next tool must make progress: edit/write it, run a relevant command, or inspect a different file. Repeating list_files or read_file against unchanged workspace state is rejected and does not count as a work round.',
          blockedTool
            ? `RECOVERY CONSTRAINT: ${blockedTool} was rejected against unchanged workspace state. It is not available this round. Select a different tool from TOOLS; do not request it again.`
            : '',
          inspectedSource
            ? `REPAIR PROGRESS REQUIRED: ${toolPath(inspectedSource.input)} has been inspected. Do not list or read again until you make progress. Create or update a regression test, run it to reproduce the defect, then edit the source and rerun it.`
            : '',
          'When done: {"type":"answer","answer":"what changed and what ran"}',
        ].filter(Boolean).join('\n\n'),
        maxTokens: 1600,
      }, input.modelRoundTimeoutMs)
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'builder_model_call_failed', trace }
      }
      const action = parse(response, availableTools)
      if (!action) {
        const blockedAction = parse(response)
        if (blockedAction?.type === 'tool' && !availableTools.includes(blockedAction.toolId)) {
          trace.push({
            round,
            toolId: blockedAction.toolId,
            input: blockedAction.input,
            ok: false,
            error: `builder_repeated_tool_call:${blockedAction.toolId}; choose a different next step`,
          })
          continue
        }
        return { ok: false, error: 'builder_invalid_model_control_output', trace }
      }
      if (action.type === 'answer') {
        if (inspectedSource) {
          trace.push({
            round,
            toolId: 'run',
            input: {},
            ok: false,
            error: 'builder_repair_progress_required: write or edit a regression test/source file before answering',
            failureClass: 'test',
            remediation: 'Create or update a regression test, run it to reproduce the defect, then edit the source and rerun it.',
          })
          continue
        }
        const modifiedExistingFile = trace.some(item => item.ok
          && (item.toolId === 'write_file' || item.toolId === 'edit_file')
          && initialPaths.has(toolPath(item.input)))
        const repairClaim = isRepairObjective(`${input.objective}\n${action.answer}`)
        const verdict = evaluateRegressionGate(input.objective, trace, modifiedExistingFile || repairClaim)
        if (verdict.satisfied) return { ok: true, answer: action.answer, trace }
        const reason = 'reason' in verdict ? verdict.reason : 'regression evidence is required'
        gateNudges += 1
        if (gateNudges > MAX_GATE_NUDGES) return { ok: false, error: 'builder_regression_evidence_required', trace }
        trace.push({ round, toolId: 'run', input: {}, ok: false, error: `builder_regression_gate: ${reason}`, failureClass: 'test', remediation: reason })
        continue
      }
      if ((action.toolId === 'write_file' || action.toolId === 'edit_file') && writeCount >= MAX_WRITES_PER_TURN) return { ok: false, error: 'builder_write_budget_exhausted', trace }
      if (action.toolId === 'run' && runCount >= MAX_RUNS_PER_TURN) return { ok: false, error: 'builder_run_budget_exhausted', trace }
      const fingerprint = `${action.toolId}:${safeJson(action.input)}`
      const inspection = action.toolId === 'list_files' || action.toolId === 'read_file'
      // An alternating list/read loop observes unchanged workspace state without progress.
      if (inspection && inspectedInCurrentWorkspaceState.has(fingerprint)) {
        trace.push({ round, toolId: action.toolId, input: action.input, ok: false, error: `builder_repeated_tool_call:${action.toolId}; choose a different next step` })
        continue
      }
      if (inspection) inspectedInCurrentWorkspaceState.add(fingerprint)
      workRounds += 1
      try {
        let output: unknown
        if (action.toolId === 'list_files') output = await this.workspace.listFiles(input.workspaceId)
        if (action.toolId === 'read_file') {
          const file = await this.workspace.readFile(input.workspaceId, toolPath(action.input))
          output = file ? { path: file.path, content: file.content, updatedAt: file.updatedAt } : null
        }
        if (action.toolId === 'write_file') output = summarize(await this.workspace.writeFile(input.workspaceId, toolPath(action.input), toolContent(action.input)))
        if (action.toolId === 'edit_file') output = summarize(await this.workspace.editFile(input.workspaceId, toolPath(action.input), text(action.input.search), text(action.input.replace)))
        if (action.toolId === 'run') {
          const files = await Promise.all((await this.workspace.listFiles(input.workspaceId)).map(file => this.workspace.readFile(input.workspaceId, file.path)))
          output = summarizeRun(await this.runner.run({ workspaceId: input.workspaceId, command: text(action.input.command), files: files.filter((file): file is BuilderFile => file !== null) }))
        }
        const runFailed = action.toolId === 'run' && (output as ReturnType<typeof summarizeRun>).exitCode !== 0
        if (runFailed) {
          const details = diagnose(`${(output as ReturnType<typeof summarizeRun>).stderr}\n${(output as ReturnType<typeof summarizeRun>).stdout}`)
          trace.push({ round, toolId: action.toolId, input: action.input, ok: false, output, error: `builder_command_failed: exit ${(output as ReturnType<typeof summarizeRun>).exitCode}`, ...details })
          continue
        }
        if (action.toolId === 'write_file' || action.toolId === 'edit_file') {
          writeCount += 1
          inspectedInCurrentWorkspaceState.clear()
        }
        if (action.toolId === 'run') runCount += 1
        trace.push({ round, toolId: action.toolId, input: action.input, ok: true, output })
        // A new-file design/create objective is complete once Builder has both written workspace
        // output and observed its requested proof command succeed. Do not spend additional model
        // rounds merely to obtain a prose completion object: that can turn a finished artifact
        // into a 422 after the model keeps inspecting the same workspace.
        if (action.toolId === 'run' && writeCount > 0 && !isRepairObjective(input.objective)) {
          return { ok: true, answer: 'Created the requested workspace files and verified the proving command completed successfully.', trace }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'builder_tool_failed'
        trace.push({ round, toolId: action.toolId, input: action.input, ok: false, error: message, ...diagnose(message) })
      }
    }
    return { ok: false, error: workRounds >= maxRounds ? 'builder_round_budget_exhausted' : 'builder_stalled_repeated_inspection', trace }
  }
}
