import type { BuilderAiPort, BuilderToolId } from './contracts.ts'

type ExecutableBuilderToolId = Exclude<BuilderToolId, 'model_control'>

const EXECUTABLE_TOOLS: readonly ExecutableBuilderToolId[] = Object.freeze([
  'list_files',
  'read_file',
  'write_file',
  'edit_file',
  'run',
])

const CONTROL_KEYS = new Set([
  'type',
  'action',
  'toolId',
  'tool_id',
  'tool',
  'toolName',
  'tool_name',
  'name',
  'function',
  'function_call',
  'tool_call',
  'tool_calls',
])

export const BUILDER_TURN_TIMEOUT_ERROR = 'builder_turn_timeout'
export const DEFAULT_BUILDER_AI_WINDOW_MS = 180_000
export const MAX_BUILDER_AI_WINDOW_MS = 220_000

const text = (value: unknown): string => typeof value === 'string' ? value : ''
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isExecutableTool = (value: string): value is ExecutableBuilderToolId => EXECUTABLE_TOOLS.includes(value as ExecutableBuilderToolId)

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

function balancedObjects(value: string): readonly string[] {
  const candidates: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
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
        candidates.push(value.slice(start, index + 1))
        start = -1
      }
    }
  }

  return Object.freeze(candidates)
}

function decodeInput(value: Record<string, unknown>): Record<string, unknown> | null {
  const nested = value.input
    ?? value.tool_input
    ?? value.toolInput
    ?? value.arguments
    ?? value.tool_arguments
    ?? value.toolArguments
    ?? value.args
    ?? value.parameters
    ?? value.payload
    ?? value.data

  if (isRecord(nested)) return nested
  if (typeof nested === 'string') {
    try {
      const decoded = JSON.parse(nested)
      return isRecord(decoded) ? decoded : null
    } catch {
      return null
    }
  }

  return Object.fromEntries(Object.entries(value).filter(([key]) => !CONTROL_KEYS.has(key)))
}

function canonicalToolControl(toolId: ExecutableBuilderToolId, input: Record<string, unknown>): string {
  return JSON.stringify({ type: 'tool', toolId, input })
}

function normalizeTypedToolRecord(value: Record<string, unknown>): string | null {
  const type = text(value.type).trim().toLowerCase()
  if (!isExecutableTool(type)) return null
  const input = decodeInput(value)
  return input ? canonicalToolControl(type, input) : null
}

/**
 * OpenAI-compatible local providers sometimes preserve the intended tool and arguments but emit a
 * compact alias instead of Builder's canonical envelope. Normalize only bounded, unambiguous forms;
 * BuilderToolLoop still applies the existing tool allowlist and exact per-tool input validation.
 */
export function normalizeBuilderControlOutput(value: string | null): string | null {
  if (value === null) return null
  const raw = stripFence(String(value))
  if (!raw) return value

  const prefixed = /^(list_files|read_file|write_file|edit_file|run)\s*(\{[\s\S]*\})$/i.exec(raw)
  if (prefixed) {
    try {
      const toolId = prefixed[1].toLowerCase()
      const input = JSON.parse(prefixed[2])
      if (isExecutableTool(toolId) && isRecord(input)) return canonicalToolControl(toolId, input)
    } catch {
      // Preserve the original response so Builder's existing typed failure telemetry remains true.
    }
  }

  const runCommand = /^run\s+command\s*:\s*`([^`\r\n]{1,2000})`\s*$/i.exec(raw)
  if (runCommand) return canonicalToolControl('run', { command: runCommand[1] })

  for (const candidate of [raw, ...balancedObjects(raw)]) {
    try {
      const decoded = JSON.parse(candidate)
      const record = Array.isArray(decoded) && decoded.length === 1 ? decoded[0] : decoded
      if (!isRecord(record)) continue
      const normalized = normalizeTypedToolRecord(record)
      if (normalized) return normalized
    } catch {
      // Try the next balanced object. Malformed output remains Builder's responsibility to classify.
    }
  }

  return value
}

function boundedDeadline(options?: { deadlineAtMs?: number; maxElapsedMs?: number }): number {
  const now = Date.now()
  const requestedDeadline = Number(options?.deadlineAtMs)
  const requestedElapsed = Number(options?.maxElapsedMs)
  const candidate = Number.isFinite(requestedDeadline)
    ? requestedDeadline
    : now + (Number.isFinite(requestedElapsed) && requestedElapsed > 0 ? requestedElapsed : DEFAULT_BUILDER_AI_WINDOW_MS)
  return Math.min(candidate, now + MAX_BUILDER_AI_WINDOW_MS)
}

/**
 * Keeps Builder inside a server-owned deadline that expires before the browser/Vercel limits. The
 * deadline covers every model call and is not retried by BuilderToolLoop, so the route can persist a
 * terminal result instead of being killed with no recoverable History entry.
 */
export function createGovernedBuilderAiPort(
  ai: BuilderAiPort,
  options?: { deadlineAtMs?: number; maxElapsedMs?: number },
): BuilderAiPort {
  const deadlineAtMs = boundedDeadline(options)

  return Object.freeze({
    async generate(input) {
      const remainingMs = Math.floor(deadlineAtMs - Date.now())
      if (remainingMs <= 0) throw new Error(BUILDER_TURN_TIMEOUT_ERROR)

      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const response = await Promise.race([
          ai.generate(input),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(BUILDER_TURN_TIMEOUT_ERROR)), Math.max(1, remainingMs))
          }),
        ])
        return normalizeBuilderControlOutput(response)
      } finally {
        if (timer) clearTimeout(timer)
      }
    },
  })
}
