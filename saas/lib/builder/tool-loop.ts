import type { BuilderAiPort, BuilderFailureClass, BuilderFile, BuilderLoopResult, BuilderRunResult, BuilderRunnerPort, BuilderToolId, BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'

type Action = { type: 'tool'; toolId: BuilderToolId; input: Record<string, unknown> } | { type: 'answer'; answer: string }
const tools: readonly BuilderToolId[] = Object.freeze(['list_files', 'read_file', 'write_file', 'edit_file', 'run'])
const MAX_WRITES_PER_TURN = 6
const MAX_RUNS_PER_TURN = 3
const text = (value: unknown) => typeof value === 'string' ? value : ''
const safeJson = (value: unknown) => { try { return JSON.stringify(value).slice(0, 18_000) } catch { return '"[unserializable]"' } }

function toolPath(input: Record<string, unknown>): string {
  return text(input.path) || text(input.filePath) || text(input.filename) || text(input.file) || text(input.name)
}

function toolContent(input: Record<string, unknown>): string {
  return text(input.content) || text(input.contents) || text(input.code) || text(input.text)
}

function parse(value: string | null): Action | null {
  try {
    const parsed = JSON.parse(String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
    if (parsed?.type === 'answer' && typeof parsed.answer === 'string') return { type: 'answer', answer: parsed.answer }
    if (parsed?.type === 'tool' && tools.includes(parsed.toolId) && parsed.input && typeof parsed.input === 'object' && !Array.isArray(parsed.input)) return { type: 'tool', toolId: parsed.toolId, input: parsed.input }
  } catch {}
  return null
}

function summarize(file: { path: string; content: string; updatedAt: number }) { return { path: file.path, bytes: new TextEncoder().encode(file.content).byteLength, updatedAt: file.updatedAt } }
function summarizeRun(result: BuilderRunResult) { return { exitCode: result.exitCode, stdout: result.stdout.slice(0, 16_000), stderr: result.stderr.slice(0, 16_000), timedOut: result.timedOut } }

function diagnose(value: unknown): { failureClass: BuilderFailureClass; remediation: string } {
  const message = String(value || '').toLowerCase()
  if (/supabase|postgres|database|constraint|pgrst|duplicate key|relation .* does not exist/.test(message)) return { failureClass: 'storage', remediation: 'Inspect the exact database error and the storage contract before retrying.' }
  if (/invalid_path|not found|no such file|module_not_found|cannot find module|enoent|path/.test(message)) return { failureClass: 'path', remediation: 'List or read the workspace files, then use a verified relative path.' }
  if (/node.*not found|command not found|runtime|timed out|timeout|sigkill/.test(message)) return { failureClass: 'runtime', remediation: 'Inspect the runtime evidence and choose an available command; do not guess environment capabilities.' }
  if (/npm err|cannot find package|module .* not found|dependency|lockfile/.test(message)) return { failureClass: 'dependency', remediation: 'Inspect the dependency manifest and installed runtime before changing source.' }
  if (/assert|expected|test|exit [1-9]|exit code [1-9]|syntaxerror|typeerror|referenceerror/.test(message)) return { failureClass: 'test', remediation: 'Read the failure output, make the smallest targeted change, then rerun the relevant test.' }
  if (/deploy|vercel|build|compile|production|preview/.test(message)) return { failureClass: 'deployment', remediation: 'Inspect the build or deployment evidence; do not treat local success as deployment proof.' }
  return { failureClass: 'unknown', remediation: 'Inspect the exact failure evidence before making another change.' }
}

function isRepairObjective(objective: string): boolean { return /\b(?:fix|repair|bug|error|failure|broken|regression)\b/i.test(objective) }

export class BuilderToolLoop {
  private readonly ai: BuilderAiPort
  private readonly workspace: BuilderWorkspacePort
  private readonly runner: BuilderRunnerPort

  constructor(ai: BuilderAiPort, workspace: BuilderWorkspacePort, runner: BuilderRunnerPort) {
    this.ai = ai
    this.workspace = workspace
    this.runner = runner
  }

  async run(input: { objective: string; workspaceId: string; maxRounds?: number }): Promise<BuilderLoopResult> {
    const trace: BuilderToolTrace[] = [], seen = new Set<string>()
    let writeCount = 0, runCount = 0
    const maxRounds = Math.max(1, Math.min(input.maxRounds ?? 8, 12))
    for (let round = 1; round <= maxRounds; round += 1) {
      const response = await this.ai.generate({
        systemPrompt: `You are COS Builder. Work only inside the supplied user workspace. Use tools to inspect, edit and run code. You have at most ${MAX_WRITES_PER_TURN} successful file writes/edits and ${MAX_RUNS_PER_TURN} successful command runs. The execution runtime is node24, ephemeral and network-denied. Never claim a file was changed or code ran unless the tool result in this turn proves it. On failure, first classify it as storage, path, runtime, dependency, test, or deployment; read the exact evidence and then choose the smallest next diagnostic or repair. Failed attempts do not consume the successful write/run budget. A repaired bug requires a successful regression command before you declare it fixed. Never access host files, secrets, repositories, networks, deployments or credentials. Return exactly one JSON control object.`,
        prompt: [
          `OBJECTIVE:\n${input.objective}`,
          `TOOLS: ${safeJson(tools)}`,
          trace.length ? `RESULTS:\n${safeJson(trace)}` : '',
          'For file tools, input MUST be {"path":"relative/file.ext","content":"..."}. Do not use file, filename, filePath, code, or contents keys.',
          'Use: {"type":"tool","toolId":"read_file","input":{"path":"..."}}',
          'When done: {"type":"answer","answer":"what changed and what ran"}',
        ].filter(Boolean).join('\n\n'),
        maxTokens: 1600,
      })
      const action = parse(response)
      if (!action) return { ok: false, error: 'builder_invalid_model_control_output', trace }
      if (action.type === 'answer') {
        if (isRepairObjective(input.objective) && !trace.some(item => item.toolId === 'run' && item.ok)) return { ok: false, error: 'builder_verification_required', trace }
        return { ok: true, answer: action.answer, trace }
      }
      if ((action.toolId === 'write_file' || action.toolId === 'edit_file') && writeCount >= MAX_WRITES_PER_TURN) return { ok: false, error: 'builder_write_budget_exhausted', trace }
      if (action.toolId === 'run' && runCount >= MAX_RUNS_PER_TURN) return { ok: false, error: 'builder_run_budget_exhausted', trace }
      const fingerprint = `${action.toolId}:${safeJson(action.input)}`
      // Local models occasionally replay the immediately previous control object after a
      // successful tool result. Treat that as recoverable feedback, not a failed workspace.
      if (seen.has(fingerprint)) {
        trace.push({ round, toolId: action.toolId, input: action.input, ok: false, error: `builder_repeated_tool_call:${action.toolId}; choose a different next step` })
        continue
      }
      seen.add(fingerprint)
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
        if (action.toolId === 'write_file' || action.toolId === 'edit_file') writeCount += 1
        if (action.toolId === 'run') runCount += 1
        trace.push({ round, toolId: action.toolId, input: action.input, ok: true, output })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'builder_tool_failed'
        trace.push({ round, toolId: action.toolId, input: action.input, ok: false, error: message, ...diagnose(message) })
      }
    }
    return { ok: false, error: 'builder_round_budget_exhausted', trace }
  }
}
