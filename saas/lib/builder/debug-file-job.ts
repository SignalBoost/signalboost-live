// saas/lib/builder/debug-file-job.ts
//
// Admission and planning for Builder single-file jobs. The job itself runs in the shared verified task loop
// (verified-task-loop.ts), which COS chat verified-file requests use too.
import { BUILDER_NODE_TYPESCRIPT } from './node-test-command.ts'

const DEBUG_ACTION = /\b(?:debug|fix|repair|troubleshoot|correct)\b|\b(?:does not work|doesn't work|broken|failing|throws?)\b/i
const CODE_EXTENSION = /\.(?:c?js|mjs|cts|mts|ts|py)$/i
const WORKSPACE_EXTENSION = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i
const TEST_PATH = /(?:^|\/)(?:.+[._-](?:test|spec)|(?:test|spec)[._-].+)\.(?:c?js|mjs|cts|mts|ts|py)$/i
const MAX_DEBUG_FILE_BYTES = 128 * 1024
const MAX_DEBUG_FILES = 4

export type DebugFilePlan = Readonly<{
  path: string
  command: string
  runtime: 'node' | 'python3'
  files: readonly string[]
}>

export type DebugFileInput = Readonly<{ path: string; content: string }>

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, "'\\\"'\\\"'")}'`
}

function normalizePath(value: unknown): string {
  return String(value || '').trim().replace(/\\/g, '/')
}

function debugCommand(path: string): Omit<DebugFilePlan, 'files'> | null {
  if (/\.py$/i.test(path)) return Object.freeze({ path, command: `python3 ${shellQuote(path)}`, runtime: 'python3' })
  if (/\.(?:ts|mts|cts)$/i.test(path)) {
    return Object.freeze({ path, command: `${BUILDER_NODE_TYPESCRIPT} ${shellQuote(path)}`, runtime: 'node' })
  }
  if (/\.(?:c?js|mjs)$/i.test(path)) return Object.freeze({ path, command: `node ${shellQuote(path)}`, runtime: 'node' })
  return null
}

function decodeDataUrl(dataUrl: string): string {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl)
  if (!match) return ''
  const mediaType = String(match[1] || '').toLowerCase()
  const payload = match[3] || ''
  const textual = !mediaType
    || mediaType.startsWith('text/')
    || /javascript|typescript|json|python|x-python|ecmascript/.test(mediaType)
    || mediaType === 'application/octet-stream'
  if (!textual) return ''
  try {
    return match[2] ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload)
  } catch {
    return ''
  }
}

function admissibleFile(file: DebugFileInput | null | undefined): DebugFileInput | null {
  const path = normalizePath(file?.path)
  const content = String(file?.content ?? '')
  if (!CODE_EXTENSION.test(path)) return null
  if (new TextEncoder().encode(content).byteLength > MAX_DEBUG_FILE_BYTES) return null
  return Object.freeze({ path, content })
}

/**
 * Accept Builder `{path,content}` files and Concierge `{name,dataUrl}` attachments.
 * Workspace source, manifests and data are preserved; the narrow debug planner separately limits executable files.
 */
export function extractBuilderSourceFiles(raw: unknown): DebugFileInput[] {
  if (!Array.isArray(raw)) return []
  const files: DebugFileInput[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const path = normalizePath(record.path || record.name || record.filename)
    const content = typeof record.content === 'string' && record.content
      ? record.content
      : decodeDataUrl(text(record.dataUrl))
    const admitted = WORKSPACE_EXTENSION.test(path) && new TextEncoder().encode(content).byteLength <= 512 * 1024
      ? Object.freeze({ path, content }) : null
    if (!admitted || seen.has(admitted.path)) continue
    seen.add(admitted.path)
    files.push(admitted)
    if (files.length >= 100) break
  }
  return files
}

/**
 * Debug jobs require an explicit repair action and one to four small executable source attachments.
 * A log dump, History transcript, or the word “debug” by itself can never create a Builder job.
 * An explicit repair request plus supported source attachments may include logs as evidence:
 * the attachments, not the pasted text, supply the bounded edit/run authority.
 */
export function planDebugFileJob(objective: string, files: readonly DebugFileInput[]): DebugFilePlan | null {
  const prompt = String(objective || '').trim()
  if (!prompt || !DEBUG_ACTION.test(prompt)) return null
  if (!Array.isArray(files)) return null
  const admitted = files.map(file => admissibleFile(file)).filter((file): file is DebugFileInput => file !== null)
  if (admitted.length < 1 || admitted.length > MAX_DEBUG_FILES || admitted.length !== files.length) return null
  const proofSource = admitted.find(file => TEST_PATH.test(file.path)) ?? admitted[0]
  const proof = debugCommand(proofSource.path)
  if (!proof) return null
  // Explicit execution instructions belong to the full loop, even when their syntax
  // is not recognized by the task-contract parser. This shortcut infers one proof.
  if (/\b(?:run(?:ning|s)?|execut(?:e|es|ed|ing|ion)|invok(?:e|ing))\b/i.test(prompt)
    || /\b(?:test|verify|check)(?:ing)?\s+(?:with|using|by)\b/i.test(prompt)
    || /\b(?:node|python3?)\s+(?:--?[\w-]+|[^\s`]+\.(?:[cm]?js|ts|py)\b)/i.test(prompt)
    || /\b(?:npm|pnpm|yarn|bun)\s+\S+/i.test(prompt)) return null
  return Object.freeze({
    ...proof,
    files: Object.freeze(admitted.map(file => file.path)),
  })
}
