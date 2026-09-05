// saas/lib/builder/tool-loop.ts
import type { BuilderAiPort, BuilderFailureClass, BuilderFile, BuilderLoopResult, BuilderRunResult, BuilderRunnerPort, BuilderToolId, BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'
import { evaluateRegressionGate, isRepairObjective } from './regression-gate.ts'
import { formatVerifiedLessonsForPrompt } from './verified-lessons.ts'
import { discoverBuilderProjectContext, formatBuilderProjectContext, normalizeBuilderSandboxCommand } from './project-context.ts'
import { deriveRepairPhase, formatRepairPhase } from './repair-phase.ts'
import { builderTaskContract, builderTaskProgress } from './task-contract.ts'
import { detectContractOscillation, formatContractOscillation } from './contract-oscillation.ts'

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
