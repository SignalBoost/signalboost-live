// saas/lib/builder/tool-loop.ts
import type { BuilderAiPort, BuilderFailureClass, BuilderFile, BuilderLoopResult, BuilderRunResult, BuilderRunnerPort, BuilderToolId, BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'
import { evaluateRegressionGate, isRepairObjective } from './regression-gate.ts'
import { formatVerifiedLessonsForPrompt } from './verified-lessons.ts'
import { discoverBuilderProjectContext, formatBuilderProjectContext, normalizeBuilderSandboxCommand } from './project-context.ts'
import { deriveRepairPhase, formatRepairPhase } from './repair-phase.ts'
import { builderTaskContract, builderTaskProgress } from './task-contract.ts'

type ToolAction = { type: 'tool'; toolId: BuilderToolId; input: Record<string, unknown> }
type Action = ToolAction | { type: 'answer'; answer: string }
const tools: readonly BuilderToolId[] = Object.freeze(['list_files', 'read_file', 'write_file', 'edit_file', 'run'])
const MAX_WRITES_PER_TURN = 6
const MAX_RUNS_PER_TURN = 5
const MAX_GATE_NUDGES = 3
const MAX_REPEAT_RECOVERY_ATTEMPTS = 4
const MAX_MODEL_ROUND_ATTEMPTS = 2
const MAX_INVALID_CONTROL_RECOVERY_ATTEMPTS = 1
const MODEL_CONTROL_MAX_TOKENS = 2_400
const MODEL_REPAIR_CONTROL_MAX_TOKENS = 4_096
const MODEL_CONTROL_RECOVERY_MAX_TOKENS = 4_096
/** Message raised by the model port when the provider reported an incomplete generation. */
const MODEL_OUTPUT_TRUNCATED = 'local_model_output_truncated'
const isOutputTruncation = (error: unknown): boolean =>
  error instanceof Error && error.message === MODEL_OUTPUT_TRUNCATED
const text = (value: unknown) => typeof value === 'string' ? value : ''
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function compactJsonValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 8_000 ? `${value.slice(0, 8_000)}...[truncated]` : value
  if (depth >= 6) return '[depth-bounded]'
  if (Array.isArray(value)) return value.slice(-24).map(item => compactJsonValue(item, depth + 1))
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).slice(0, 48).map(([key, item]) => [key, compactJsonValue(item, depth + 1)]),
    )
  }
  return value
}

const safeJson = (value: unknown, maximum = 18_000) => {
  try {
    const compact = compactJsonValue(value)
    let encoded = JSON.stringify(compact) ?? 'null'
    if (encoded.length <= maximum) return encoded
    if (Array.isArray(compact)) {
      const tail = [...compact]
      while (tail.length > 1 && encoded.length > maximum) {
        tail.shift()
        encoded = JSON.stringify(tail)
      }
      if (encoded.length <= maximum) return encoded
    }
    return JSON.stringify({ truncated: true, excerpt: encoded.slice(0, Math.max(0, maximum - 64)) })
  } catch {
    return '"[unserializable]"'
  }
}

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
  let request = input
  for (let modelAttempt = 1; modelAttempt <= MAX_MODEL_ROUND_ATTEMPTS; modelAttempt += 1) {
    try {
      return await within(ai.generate(request), timeoutMs)
    } catch (error) {
      lastError = error
      if (modelAttempt === MAX_MODEL_ROUND_ATTEMPTS) throw error
      if (error instanceof Error && error.message === 'builder_model_output_limit') {
        request = { ...request, maxTokens: Math.min(8_192, request.maxTokens * 2) }
      } else if (!(error instanceof Error && error.message === 'builder_model_round_timeout')) throw error
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

function hasToolContent(input: Record<string, unknown>): boolean {
  return ['content', 'contents', 'code', 'text'].some(key => typeof input[key] === 'string')
}

function validToolInput(toolId: BuilderToolId, input: Record<string, unknown>): boolean {
  if (toolId === 'list_files') return true
  if (toolId === 'read_file') return Boolean(toolPath(input))
  if (toolId === 'write_file') return Boolean(toolPath(input)) && hasToolContent(input)
  if (toolId === 'edit_file') {
    return Boolean(toolPath(input))
      && typeof input.search === 'string'
      && input.search.length > 0
      && typeof input.replace === 'string'
  }
  return toolId === 'run' && typeof input.command === 'string' && input.command.trim().length > 0
}

function jsonObjectCandidates(value: string | null): readonly string[] {
  const raw = String(value || '').trim()
  const fenced = raw.replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '')
  const candidates = [fenced]
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < fenced.length; index += 1) {
    const character = fenced[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') {
      if (depth === 0) start = index
      depth += 1
      continue
    }
    if (character === '}' && depth > 0) {
      depth -= 1
      if (depth === 0 && start >= 0) {
        candidates.push(fenced.slice(start, index + 1))
        start = -1
      }
    }
  }

  return Object.freeze([...new Set(candidates.filter(Boolean))])
}

function normalizedToolInput(value: Record<string, unknown>): Record<string, unknown> | null {
  const candidate = value.input ?? value.tool_input ?? value.toolInput ?? value.arguments ?? value.tool_arguments ?? value.toolArguments ?? value.args ?? value.parameters ?? value.payload ?? value.data
  if (isRecord(candidate)) return candidate
  if (typeof candidate === 'string') {
    try {
      const decoded = JSON.parse(candidate)
      return isRecord(decoded) ? decoded : null
    } catch {
      return null
    }
  }
  // Some OpenAI-compatible local servers flatten function arguments beside the action name.
  // Keep only non-control fields, then apply the same per-tool validation below.
  const controlKeys = new Set(['type', 'action', 'toolId', 'tool_id', 'tool', 'toolName', 'tool_name', 'name', 'function', 'function_call', 'tool_call', 'tool_calls'])
  const flat = Object.fromEntries(Object.entries(value).filter(([key]) => !controlKeys.has(key)))
  return Object.keys(flat).length > 0 ? flat : {}
}

function controlRecord(value: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(value.function)) return value.function
  if (isRecord(value.function_call)) return value.function_call
  if (isRecord(value.tool_call)) return isRecord(value.tool_call.function) ? value.tool_call.function : value.tool_call
  if (Array.isArray(value.tool_calls) && isRecord(value.tool_calls[0])) {
    const first = value.tool_calls[0]
    return isRecord(first.function) ? first.function : first
  }
  return value
}

function parse(value: string | null, allowedTools: readonly BuilderToolId[] = tools): Action | null {
  for (const candidate of jsonObjectCandidates(value)) {
    try {
      const decoded = JSON.parse(candidate)
      const parsed = Array.isArray(decoded) && decoded.length === 1 ? decoded[0] : decoded
      if (!isRecord(parsed)) continue
      const control = controlRecord(parsed)
      if (control.type === 'answer' || control.action === 'answer') {
        const answer = text(control.answer) || text(control.content) || text(control.message) || text(control.final) || text(control.final_answer)
        if (answer.trim()) return { type: 'answer', answer }
      }
      const toolId = text(control.toolId) || text(control.tool_id) || text(control.tool) || text(control.toolName) || text(control.tool_name) || text(control.name) || (control.type === 'tool' ? text(control.action) : '') || text(control.action)
      const input = normalizedToolInput(control)
      if (!toolId || !input) continue
      if (!allowedTools.includes(toolId as BuilderToolId) || !validToolInput(toolId as BuilderToolId, input)) continue
      return { type: 'tool', toolId: toolId as BuilderToolId, input }
    } catch {}
  }
  return null
}

type ModelControlFailure = Readonly<{
  error: string
  remediation: string
  telemetry: Readonly<Record<string, boolean | number>>
}>

function modelControlFailure(value: string | null): ModelControlFailure {
  const raw = String(value || '')
  const trimmed = raw.trim()
  const hasThinkOpen = /<think(?:\s[^>]*)?>/i.test(raw)
  const hasThinkClose = /<\/think>/i.test(raw)
  const hasUnclosedObject = (() => {
    let depth = 0
    let inString = false
    let escaped = false
    for (const character of trimmed) {
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
      } else if (character === '"') inString = true
      else if (character === '{') depth += 1
      else if (character === '}' && depth > 0) depth -= 1
    }
    return depth > 0
  })()
  const anyValidJson = jsonObjectCandidates(raw).some((candidate) => {
    try { JSON.parse(candidate); return true } catch { return false }
  })
  const telemetry = Object.freeze({
    responseLength: raw.length,
    startsWithObject: trimmed.startsWith('{'),
    endsWithObject: trimmed.endsWith('}'),
    hasThinkOpen,
    hasThinkClose,
    hasUnclosedObject,
    anyValidJson,
  })
  if (!trimmed) return { error: 'builder_model_control_empty_response', remediation: 'The reasoner returned no control content. Inspect local inference telemetry for HTTP status, timeout, or an empty provider message before retrying.', telemetry }
  if (hasUnclosedObject && !trimmed.endsWith('}')) return { error: 'builder_model_control_truncated', remediation: 'The response contains incomplete JSON. Check the recorded provider finish reason before attributing this to the token limit.', telemetry }
  if (hasThinkOpen && !hasThinkClose) return { error: 'builder_model_control_reasoning_truncated', remediation: 'The reasoner stopped inside a reasoning envelope before emitting a control object. Inspect the control-token budget and reasoning-output settings before retrying.', telemetry }
  if (hasThinkOpen) return { error: 'builder_model_control_reasoning_only', remediation: 'The reasoner emitted a reasoning envelope but no usable JSON control object. Configure the model to emit its final control message separately, then retry.', telemetry }
  if (anyValidJson) return { error: 'builder_model_control_schema_mismatch', remediation: 'The reasoner emitted valid JSON that is not a control object the Builder accepts (unrecognized tool, missing input, or a non-control shape). Align the control-schema instruction or the accepted schema, then retry.', telemetry }
  return { error: 'builder_model_control_malformed_json', remediation: 'The reasoner emitted content with no parseable JSON control object and no reasoning envelope (likely invalid quoting, escaping, or trailing commas). Constrain the model to strict JSON output, then retry.', telemetry }
}

function summarize(file: { path: string; content: string; updatedAt: number }) { return { path: file.path, bytes: new TextEncoder().encode(file.content).byteLength, updatedAt: file.updatedAt } }
function summarizeRun(result: BuilderRunResult) { return { exitCode: result.exitCode, stdout: result.stdout.slice(0, 16_000), stderr: result.stderr.slice(0, 16_000), timedOut: result.timedOut } }

function verifiedRepairAnswer(trace: readonly BuilderToolTrace[]): string {
  const changedPaths = [...new Set(trace
    .filter(item => item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))
    .map(item => toolPath(item.input))
    .filter(Boolean))]
  const passingRun = [...trace].reverse().find(item => item.ok && item.toolId === 'run')
  const command = passingRun ? text(passingRun.input.command) : ''
  const target = changedPaths.length ? changedPaths.join(', ') : 'the staged project'
  return `Repaired ${target} and verified ${command || 'the proving command'} completed successfully.`
}

function diagnose(value: unknown, knownPaths: readonly string[] = []): { failureClass: BuilderFailureClass; remediation: string } {
  const message = String(value || '').toLowerCase()
  if (/supabase|postgres|database|constraint|pgrst|duplicate key|relation .* does not exist/.test(message)) return { failureClass: 'storage', remediation: 'Inspect the exact database error and the storage contract before retrying.' }
  if (/cannot find package|no module named|unable to resolve|npm err|dependency|lockfile/.test(message)) return { failureClass: 'dependency', remediation: 'Inspect the dependency manifest and installed runtime before changing source.' }
  if (/cannot find module\s+['"](?![./])[^'"]+['"]/.test(message)) return { failureClass: 'dependency', remediation: 'Inspect the dependency manifest and installed runtime before changing source.' }
  if (/invalid_path|not found|no such file|module_not_found|cannot find module|enoent|path/.test(message)) {
    // A generic "go list the files" nudge is not enough: the model has already listed them and still
    // invents a directory prefix. Name the real paths so the next command cannot be a guess.
    const listing = knownPaths.slice(0, 20).join(', ')
    return {
      failureClass: 'path',
      remediation: listing
        ? `This workspace contains exactly these paths: ${listing}. Use one of them verbatim, relative to the workspace root, and do not prepend any directory that is not listed here.`
        : 'List or read the workspace files, then use a verified relative path.',
    }
  }
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
    const completedMutations = new Set<string>()
    const completedRunsInCurrentWorkspaceState = new Set<string>()
    const initialListing = await this.workspace.listFiles(input.workspaceId)
    const manifest = initialListing.find(file => file.path === 'package.json')
    const manifestFile = manifest ? await this.workspace.readFile(input.workspaceId, manifest.path) : null
    const projectContext = discoverBuilderProjectContext(initialListing.map(file => ({
      path: file.path,
      ...(file.path === 'package.json' && manifestFile ? { content: manifestFile.content } : {}),
    })))
    const initialPaths = new Set(initialListing.map(file => file.path))
    const task = builderTaskContract(input.objective)
    const maxWrites = Math.min(16, Math.max(MAX_WRITES_PER_TURN, task.files.length + 4))
    let workspacePaths: string[] = [...initialPaths]
    let repairObjective = isRepairObjective(input.objective)
    let writeCount = 0, runCount = 0, gateNudges = 0
    const maxRounds = Math.max(1, Math.min(input.maxRounds ?? Math.max(8, task.files.length * 3 + task.commands.length + 4), 24))
    let workRounds = 0
    let attempt = 0
    while (workRounds < maxRounds && attempt < maxRounds + MAX_REPEAT_RECOVERY_ATTEMPTS) {
      attempt += 1
      const round = attempt
      const lastTrace = trace.at(-1)
      const progress = builderTaskProgress(task, workspacePaths, trace)
      // A model can alternate list_files and read_file to evade a last-tool-only
      // restriction. Keep every repeated inspection unavailable until a write/edit
      // changes the workspace and resets the inspection state.
      const lastWorkspaceChange = Math.max(...trace.map((item, index) => (
        item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file') ? index : -1
      )))
      const blockedInspectionTools = new Set(trace
        .slice(lastWorkspaceChange + 1)
        .filter(item => (item.toolId === 'list_files' || item.toolId === 'read_file')
          && item.error?.startsWith('builder_repeated_tool_call:'))
        .map(item => item.toolId))
      const blockedTool = lastTrace?.error?.startsWith('builder_repeated_tool_call:')
        ? lastTrace.toolId
        : null
      const repairPhase = repairObjective ? deriveRepairPhase(trace, initialPaths) : null
      const repairNeedsChange = repairObjective && !trace.some(item => item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))
      const inspectedSource = repairNeedsChange
        ? [...trace].reverse().find(item => item.ok && item.toolId === 'read_file' && toolPath(item.input))
        : undefined
      const availableTools = tools
        .filter(toolId => toolId !== blockedTool)
        .filter(toolId => !blockedInspectionTools.has(toolId))
        .filter(toolId => !inspectedSource || (toolId !== 'list_files' && toolId !== 'read_file'))
      const promptParts = [
        formatVerifiedLessonsForPrompt(input.priorLessons || [], [...trace].reverse().find(item => !item.ok && item.failureClass)?.failureClass || null),
        `OBJECTIVE:\n${input.objective}`,
        `DELIVERY PROGRESS: ${safeJson(progress)}. Writes remaining: ${maxWrites - writeCount}. Create every missing file before polishing newly created files. Then run every pending command separately, preserving its exit status. A passing first command is not completion when another command or file is still pending.`,
        formatBuilderProjectContext(projectContext),
        repairPhase ? formatRepairPhase(repairPhase, projectContext.recommendedTestCommand) : '',
        `TOOLS: ${safeJson(availableTools)}`,
        trace.length ? `RESULTS:\n${safeJson(trace)}` : '',
        'TOOL INPUT SCHEMAS: list_files => {"type":"tool","toolId":"list_files","input":{}}; read_file => {"type":"tool","toolId":"read_file","input":{"path":"relative/file.ext"}}; write_file => {"type":"tool","toolId":"write_file","input":{"path":"relative/file.ext","content":"complete new file"}}; edit_file => {"type":"tool","toolId":"edit_file","input":{"path":"relative/file.ext","search":"small unique existing text","replace":"replacement text"}}; run => {"type":"tool","toolId":"run","input":{"command":"command"}}.',
        'For an existing-file repair, prefer edit_file with the smallest unique search/replace. Do not return the whole existing file through write_file unless a minimal edit cannot express the change.',
        availableTools.includes('read_file')
          ? 'Use: {"type":"tool","toolId":"read_file","input":{"path":"..."}}'
          : 'Do not request read_file in this round; it is unavailable until the workspace changes.',
        'After inspecting a file, the next tool must make progress: edit/write it, run a relevant command, or inspect a different file. Repeating list_files or read_file against unchanged workspace state is rejected and does not count as a work round.',
        blockedInspectionTools.size
          ? `RECOVERY CONSTRAINT: ${[...blockedInspectionTools].join(', ')} ${blockedInspectionTools.size === 1 ? 'was' : 'were'} rejected against unchanged workspace state. ${blockedInspectionTools.size === 1 ? 'It is' : 'They are'} unavailable this round. Select a different tool from TOOLS; do not request ${blockedInspectionTools.size === 1 ? 'it' : 'them'} again.`
          : blockedTool
            ? `RECOVERY CONSTRAINT: ${blockedTool} was rejected in the preceding round. It is unavailable this round. Select a different tool from TOOLS; do not request it again.`
            : '',
        inspectedSource
          ? `REPAIR PROGRESS REQUIRED: ${toolPath(inspectedSource.input)} has been inspected. Do not list or read again until you make progress. ${projectContext.recommendedTestCommand ? `Run ${projectContext.recommendedTestCommand} to reproduce the defect, then edit the source and rerun it.` : 'Create or update a regression test, run it to reproduce the defect, then edit the source and rerun it.'}`
          : '',
        'When done: {"type":"answer","answer":"what changed and what ran"}',
      ].filter(Boolean)

      let action: Action | null = null
      let blockedAction: ToolAction | null = null
      let controlFailure: ModelControlFailure | null = null
      for (let controlAttempt = 0; controlAttempt <= MAX_INVALID_CONTROL_RECOVERY_ATTEMPTS; controlAttempt += 1) {
        const recoveryInstruction = controlAttempt > 0
          ? `CONTROL RECOVERY ATTEMPT ${controlAttempt}: The previous response could not be used. Return exactly one compact JSON object using one TOOL INPUT SCHEMA above. Use only type, toolId, and input; input must be an object, not a JSON string. Emit no prose or Markdown. For an existing file, use edit_file with search and replace instead of rewriting the whole file.`
          : ''
        const controlBudget = controlAttempt > 0
          ? MODEL_CONTROL_RECOVERY_MAX_TOKENS
          : repairObjective || task.files.length > 1 ? MODEL_REPAIR_CONTROL_MAX_TOKENS : MODEL_CONTROL_MAX_TOKENS
        const generateControl = (maxTokens: number) => generateWithRetry(this.ai, {
            systemPrompt: `You are COS Builder. Work only inside the supplied user workspace. Use tools to inspect, edit and run code. You have at most ${maxWrites} successful file writes/edits and ${MAX_RUNS_PER_TURN} successful command runs. The execution runtime is node24, ephemeral and network-denied. Never claim a file was changed or code ran unless the tool result in this turn proves it. On failure, first classify it as storage, path, runtime, dependency, test, or deployment; read the exact evidence and then choose the smallest next diagnostic or repair. Failed attempts do not consume the successful write/run budget. For a repair objective, do not declare success until a regression test has failed before the repair and passed after it. Use an existing reproducing test when available; otherwise add one. A new build with conditional instructions to fix failing tests is still a creation task: write complete files (including the CLI entry point), create tests and sample data, execute all requested commands, and repair only observed failures. Do not repeatedly inspect or polish one new file while other deliverables are missing. Never access host files, secrets, repositories, networks, deployments or credentials. Return exactly one JSON control object.`,
            prompt: [...promptParts, recoveryInstruction].filter(Boolean).join('\n\n'),
            maxTokens,
          }, input.modelRoundTimeoutMs)

        // A provider-confirmed incomplete generation is a budget problem, not a model mistake:
        // retry the same round once with double the room, and never parse the fragment.
        let response: string | null
        try {
          response = await generateControl(controlBudget)
        } catch (error) {
          if (!isOutputTruncation(error)) {
            return { ok: false, error: error instanceof Error ? error.message : 'builder_model_call_failed', trace }
          }
          try {
            response = await generateControl(controlBudget * 2)
          } catch (retryError) {
            if (isOutputTruncation(retryError)) return { ok: false, error: 'builder_model_output_limit', trace }
            return { ok: false, error: retryError instanceof Error ? retryError.message : 'builder_model_call_failed', trace }
          }
        }

        action = parse(response, availableTools)
        if (action) break
        const unrestricted = parse(response)
        if (unrestricted?.type === 'tool' && !availableTools.includes(unrestricted.toolId)) {
          blockedAction = unrestricted
          break
        }
        controlFailure = modelControlFailure(response)
        console.warn('[builder_invalid_model_control_output]', {
          round,
          controlAttempt,
          ...controlFailure.telemetry,
          // Server-log only (owner-readable), never added to the client trace: the exact rejected
          // control attempt is what separates malformed JSON from a valid-JSON schema mismatch.
          sample: String(response || '').replace(/\s+/g, ' ').trim().slice(0, 240),
        })
      }

      if (blockedAction) {
        trace.push({
          round,
          toolId: blockedAction.toolId,
          input: blockedAction.input,
          ok: false,
          error: `builder_repeated_tool_call:${blockedAction.toolId}; choose a different next step`,
        })
        continue
      }
      if (!action) {
        const failure = controlFailure ?? modelControlFailure(null)
        trace.push({
          round,
          toolId: 'model_control',
          input: {},
          ok: false,
          output: failure.telemetry,
          error: failure.error,
          failureClass: failure.error === 'builder_model_control_empty_response' ? 'runtime' : 'unknown',
          remediation: failure.remediation,
        })
        return { ok: false, error: failure.error, trace }
      }

      if (action.type === 'answer') {
        if (!progress.satisfied && !repairObjective) {
          gateNudges += 1
          trace.push({ round, toolId: 'model_control', input: {}, ok: false,
            error: 'builder_task_incomplete', remediation: `Complete the missing files and pending commands: ${safeJson(progress)}` })
          if (gateNudges > MAX_GATE_NUDGES) return { ok: false, error: 'builder_task_incomplete', trace }
          continue
        }
        repairObjective ||= isRepairObjective(`${input.objective}\n${action.answer}`)
        const verdict = evaluateRegressionGate(input.objective, trace, repairObjective)
        if (verdict.satisfied && progress.satisfied) return { ok: true, answer: action.answer, trace }
        if (repairObjective) {
          const listed = await this.workspace.listFiles(input.workspaceId)
          workspacePaths = listed.map(file => file.path)
          const files = (await Promise.all(listed.map(file => this.workspace.readFile(input.workspaceId, file.path))))
            .filter((file): file is BuilderFile => file !== null)
          const proofFile = files.find(file => /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file.path))
          const observedFailedCommand = trace.find(item => item.toolId === 'run' && !item.ok)?.input.command
          const proofCommand = (typeof observedFailedCommand === 'string' ? observedFailedCommand : '')
            || (projectContext.manifestPath ? projectContext.recommendedTestCommand : '')
            || (proofFile ? `node --experimental-strip-types --test ${proofFile.path}` : '')
            || projectContext.recommendedTestCommand || ''
          const proofIdx = trace
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.toolId === 'run' && text(item.input.command) === proofCommand)
          const failedProof = proofIdx.find(({ item }) => !item.ok)
          const passedProof = proofIdx.find(({ item }) => item.ok)
          const verifiedAfterFail = failedProof
            ? proofIdx.some(({ item, index }) => item.ok && index > failedProof.index)
            : false
          const edited = trace.some((item, index) => index > (failedProof?.index ?? -1)
            && item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))

          if (proofCommand && !failedProof && !passedProof) {
            if (runCount >= MAX_RUNS_PER_TURN) return { ok: false, error: 'builder_run_budget_exhausted', trace }
            const output = summarizeRun(await this.runner.run({ workspaceId: input.workspaceId, command: proofCommand, files }))
            const failed = output.exitCode !== 0
            trace.push({
              round,
              toolId: 'run',
              input: { command: proofCommand },
              ok: !failed,
              output,
              ...(failed ? { error: `builder_command_failed: exit ${output.exitCode}`, failureClass: 'test' as const } : {}),
            })
            runCount += 1
            continue
          }
          if (proofCommand && failedProof && edited && !verifiedAfterFail) {
            if (runCount >= MAX_RUNS_PER_TURN) return { ok: false, error: 'builder_run_budget_exhausted', trace }
            const output = summarizeRun(await this.runner.run({ workspaceId: input.workspaceId, command: proofCommand, files }))
            const failed = output.exitCode !== 0
            trace.push({
              round,
              toolId: 'run',
              input: { command: proofCommand },
              ok: !failed,
              output,
              ...(failed ? { error: `builder_command_failed: exit ${output.exitCode}`, failureClass: 'test' as const } : {}),
            })
            runCount += 1
            if (!failed && evaluateRegressionGate(input.objective, trace, true).satisfied && builderTaskProgress(task, workspacePaths, trace).satisfied) return { ok: true, answer: action.answer, trace }
            continue
          }
          if (passedProof && !failedProof && !edited) {
            return { ok: false, error: 'builder_regression_not_reproduced', trace }
          }
        }
        const reason = 'reason' in verdict ? verdict.reason : 'regression evidence is required'
        gateNudges += 1
        if (gateNudges > MAX_GATE_NUDGES) return { ok: false, error: 'builder_regression_evidence_required', trace }
        continue
      }
      if ((action.toolId === 'write_file' || action.toolId === 'edit_file') && writeCount >= maxWrites) return { ok: false, error: 'builder_write_budget_exhausted', trace }
      if (action.toolId === 'run' && runCount >= MAX_RUNS_PER_TURN) return { ok: false, error: 'builder_run_budget_exhausted', trace }
      const fingerprint = `${action.toolId}:${safeJson(action.input)}`
      const inspection = action.toolId === 'list_files' || action.toolId === 'read_file'
      const mutation = action.toolId === 'write_file' || action.toolId === 'edit_file'
      if (mutation && !repairObjective && progress.missingFiles.length > 0
        && workspacePaths.includes(toolPath(action.input)) && !initialPaths.has(toolPath(action.input))) {
        trace.push({ round, toolId: action.toolId, input: action.input, ok: false,
          error: 'builder_missing_deliverables', remediation: `Create ${progress.missingFiles.join(', ')} before revising this new file. Then run the requested commands and use their output for targeted repairs.` })
        continue
      }
      if (mutation && initialPaths.has(toolPath(action.input))) repairObjective = true
      // An alternating list/read loop observes unchanged workspace state without progress.
      if (inspection && inspectedInCurrentWorkspaceState.has(fingerprint)) {
        trace.push({ round, toolId: action.toolId, input: action.input, ok: false, error: `builder_repeated_tool_call:${action.toolId}; choose a different next step` })
        continue
      }
      if ((mutation && completedMutations.has(fingerprint))
        || (action.toolId === 'run' && completedRunsInCurrentWorkspaceState.has(fingerprint))) {
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
          const listed = await this.workspace.listFiles(input.workspaceId)
          workspacePaths = listed.map(file => file.path)
          const files = (await Promise.all(listed.map(file => this.workspace.readFile(input.workspaceId, file.path))))
            .filter((file): file is BuilderFile => file !== null)
          let command = normalizeBuilderSandboxCommand(text(action.input.command), files)
          if (!command) command = projectContext.recommendedTestCommand || ''
          if (!command) {
            const proof = files.find(file => /builderAsyncJobs|builderDebugFileJob|builderRoutingStrict/.test(file.path))
              || files.find(file => /\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(file.path))
            command = proof ? `node --experimental-strip-types --test ${proof.path}` : 'node --experimental-strip-types --test'
          }
          action.input = { ...action.input, command }
          output = summarizeRun(await this.runner.run({ workspaceId: input.workspaceId, command, files }))
        }
        const runFailed = action.toolId === 'run' && (output as ReturnType<typeof summarizeRun>).exitCode !== 0
        if (runFailed) {
          const details = diagnose(`${(output as ReturnType<typeof summarizeRun>).stderr}\n${(output as ReturnType<typeof summarizeRun>).stdout}`, workspacePaths)
          trace.push({ round, toolId: action.toolId, input: action.input, ok: false, output, error: `builder_command_failed: exit ${(output as ReturnType<typeof summarizeRun>).exitCode}`, ...details })
          continue
        }
        if (action.toolId === 'write_file' || action.toolId === 'edit_file') {
          writeCount += 1
          if (!workspacePaths.includes(toolPath(action.input))) workspacePaths.push(toolPath(action.input))
          inspectedInCurrentWorkspaceState.clear()
          completedMutations.add(fingerprint)
          completedRunsInCurrentWorkspaceState.clear()
        }
        if (action.toolId === 'run') {
          runCount += 1
          completedRunsInCurrentWorkspaceState.add(fingerprint)
        }
        trace.push({ round, toolId: action.toolId, input: action.input, ok: true, output })
        if (action.toolId === 'run' && repairObjective) {
          const modifiedExistingFile = trace.some(item => item.ok
            && (item.toolId === 'write_file' || item.toolId === 'edit_file')
            && initialPaths.has(toolPath(item.input)))
          const verdict = evaluateRegressionGate(input.objective, trace, modifiedExistingFile)
          if (verdict.satisfied && builderTaskProgress(task, workspacePaths, trace).satisfied) return { ok: true, answer: verifiedRepairAnswer(trace), trace }
        }
        // A new-file design/create objective is complete once Builder has both written workspace
        // output and observed its requested proof command succeed. Do not spend additional model
        // rounds merely to obtain a prose completion object: that can turn a finished artifact
        // into a 422 after the model keeps inspecting the same workspace.
        if (action.toolId === 'run' && writeCount > 0 && !repairObjective && builderTaskProgress(task, workspacePaths, trace).satisfied) {
          return { ok: true, answer: 'Created the requested workspace files and verified the proving command completed successfully.', trace }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'builder_tool_failed'
        trace.push({ round, toolId: action.toolId, input: action.input, ok: false, error: message, ...diagnose(message, workspacePaths) })
      }
    }
    return { ok: false, error: workRounds >= maxRounds ? 'builder_round_budget_exhausted' : 'builder_stalled_repeated_inspection', trace }
  }
}
