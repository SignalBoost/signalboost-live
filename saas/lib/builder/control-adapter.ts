import type { BuilderAiPort, BuilderToolId } from './contracts.ts'

type ExecutableBuilderToolId = Exclude<BuilderToolId, 'model_control'>

const EXECUTABLE_TOOLS: readonly ExecutableBuilderToolId[] = Object.freeze([
  'list_files',
  'read_file',
  'search_files',
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

const XML_INPUT_KEYS = Object.freeze([
  'path',
  'filePath',
  'filename',
  'file',
  'name',
  'content',
  'contents',
  'code',
  'text',
  'search',
  'replace',
  'command',
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

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim()
}

function xmlAttributes(value: string): Record<string, string> {
  const result: Record<string, string> = {}
  const pattern = /([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (const match of value.matchAll(pattern)) {
    result[match[1]] = decodeXmlText(match[2] ?? match[3] ?? '')
  }
  return result
}

function xmlNamedInput(value: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of XML_INPUT_KEYS) {
    const pattern = new RegExp(`<${key}\\b[^>]*>([\\s\\S]*?)<\\/${key}>`, 'i')
    const match = pattern.exec(value)
    if (match) result[key] = decodeXmlText(match[1])
  }
  for (const match of value.matchAll(/<parameter\b([^>]*)>([\s\S]*?)<\/parameter>/gi)) {
    const attributes = xmlAttributes(match[1])
    const name = attributes.name
    if (name && XML_INPUT_KEYS.includes(name as typeof XML_INPUT_KEYS[number])) result[name] = decodeXmlText(match[2])
  }
  return result
}

function normalizeDeepSeekXmlControl(raw: string): string | null {
  for (const match of raw.matchAll(/<invoke\b([^>]*)>([\s\S]*?)<\/invoke>/gi)) {
    const attributes = xmlAttributes(match[1])
    const toolId = String(attributes.name || '').trim().toLowerCase()
    if (!isExecutableTool(toolId)) continue
    const input = xmlNamedInput(match[2])
    return canonicalToolControl(toolId, input)
  }

  for (const match of raw.matchAll(/<(list_files|read_file|search_files|write_file|edit_file|run)\b([^>]*)\/>/gi)) {
    const toolId = String(match[1] || '').trim().toLowerCase()
    if (!isExecutableTool(toolId)) continue
    return canonicalToolControl(toolId, xmlAttributes(match[2]))
  }

  for (const match of raw.matchAll(/<tool\b[^>]*>([\s\S]*?)<\/tool>/gi)) {
    const body = match[1]
    const toolMatch = /<toolId\b[^>]*>([\s\S]*?)<\/toolId>/i.exec(body)
    const toolId = decodeXmlText(toolMatch?.[1] || '').toLowerCase()
    if (!isExecutableTool(toolId)) continue
    const inputMatch = /<input\b[^>]*>([\s\S]*?)<\/input>/i.exec(body)
    const input = xmlNamedInput(inputMatch?.[1] || '')
    return canonicalToolControl(toolId, input)
  }

  for (const match of raw.matchAll(/<tool_call\b([^>]*)>([\s\S]*?)<\/tool_call>/gi)) {
    const attributes = xmlAttributes(match[1])
    const toolId = String(attributes.name || '').trim().toLowerCase()
    if (!isExecutableTool(toolId)) continue
    for (const candidate of balancedObjects(match[2])) {
      try {
        const decoded = JSON.parse(candidate)
        if (!isRecord(decoded)) continue
        const input = decodeInput(decoded)
        if (input) return canonicalToolControl(toolId, input)
      } catch {
        // Try another bounded object inside the tool_call envelope.
      }
    }
    const input = xmlNamedInput(match[2])
    if (Object.keys(input).length > 0) return canonicalToolControl(toolId, input)
  }

  return null
}

/**
 * OpenAI-compatible local providers sometimes preserve the intended tool and arguments but emit a
 * compact alias instead of Builder's canonical envelope. DeepSeek can also emit bounded XML-style
 * tool envelopes. Normalize only known executable tools and unambiguous argument shapes; the
 * BuilderToolLoop still applies the existing tool allowlist and exact per-tool input validation.
 */
export function normalizeBuilderControlOutput(value: string | null): string | null {
  if (value === null) return null
  const raw = stripFence(String(value))
  if (!raw) return value

  const prefixed = /^(list_files|read_file|search_files|write_file|edit_file|run)\s*(\{[\s\S]*\})$/i.exec(raw)
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

  const deepSeekXml = normalizeDeepSeekXmlControl(raw)
  if (deepSeekXml) return deepSeekXml

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
