import type { BuilderAiPort, BuilderFile, BuilderLoopResult, BuilderRunResult, BuilderRunnerPort, BuilderToolId, BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'

type Action = { type: 'tool'; toolId: BuilderToolId; input: Record<string, unknown> } | { type: 'answer'; answer: string }
const tools: readonly BuilderToolId[] = Object.freeze(['list_files', 'read_file', 'write_file', 'edit_file', 'run'])
const MAX_WRITES_PER_TURN = 6
const MAX_RUNS_PER_TURN = 3
const text = (value: unknown) => typeof value === 'string' ? value : ''
const safeJson = (value: unknown) => { try { return JSON.stringify(value).slice(0, 18_000) } catch { return '"[unserializable]"' } }

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
        systemPrompt: `You are COS Builder. Work only inside the supplied user workspace. Use tools to inspect, edit and run code. You have at most ${MAX_WRITES_PER_TURN} file writes/edits and ${MAX_RUNS_PER_TURN} command runs. Never claim a file was changed or code ran unless the tool result in this turn proves it. Never access host files, secrets, repositories, networks, deployments or credentials. Return exactly one JSON control object.`,
        prompt: [
          `OBJECTIVE:\n${input.objective}`,
          `TOOLS: ${safeJson(tools)}`,
          trace.length ? `RESULTS:\n${safeJson(trace)}` : '',
          'Use: {"type":"tool","toolId":"read_file","input":{"path":"..."}}',
          'When done: {"type":"answer","answer":"what changed and what ran"}',
        ].filter(Boolean).join('\n\n'),
        maxTokens: 1600,
      })
      const action = parse(response)
      if (!action) return { ok: false, error: 'builder_invalid_model_control_output', trace }
      if (action.type === 'answer') return { ok: true, answer: action.answer, trace }
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
      if (action.toolId === 'write_file' || action.toolId === 'edit_file') writeCount += 1
      if (action.toolId === 'run') runCount += 1
      try {
        let output: unknown
        if (action.toolId === 'list_files') output = await this.workspace.listFiles(input.workspaceId)
        if (action.toolId === 'read_file') {
          const file = await this.workspace.readFile(input.workspaceId, text(action.input.path))
          output = file ? { path: file.path, content: file.content, updatedAt: file.updatedAt } : null
        }
        if (action.toolId === 'write_file') output = summarize(await this.workspace.writeFile(input.workspaceId, text(action.input.path), text(action.input.content)))
        if (action.toolId === 'edit_file') output = summarize(await this.workspace.editFile(input.workspaceId, text(action.input.path), text(action.input.search), text(action.input.replace)))
        if (action.toolId === 'run') {
          const files = await Promise.all((await this.workspace.listFiles(input.workspaceId)).map(file => this.workspace.readFile(input.workspaceId, file.path)))
          output = summarizeRun(await this.runner.run({ workspaceId: input.workspaceId, command: text(action.input.command), files: files.filter((file): file is BuilderFile => file !== null) }))
        }
        trace.push({ round, toolId: action.toolId, input: action.input, ok: true, output })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'builder_tool_failed'
        trace.push({ round, toolId: action.toolId, input: action.input, ok: false, error: message })
        return { ok: false, error: message, trace }
      }
    }
    return { ok: false, error: 'builder_round_budget_exhausted', trace }
  }
}
