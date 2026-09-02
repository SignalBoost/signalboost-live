import { normalizeBuilderControlOutput } from './control-adapter.ts'
import type {
  BuilderAiPort,
  BuilderFile,
  BuilderLoopResult,
  BuilderRunnerPort,
  BuilderToolTrace,
  BuilderWorkspacePort,
} from './contracts.ts'

const DEBUG_ACTION = /\b(?:debug|fix|repair|troubleshoot|correct)\b|\b(?:does not work|doesn't work|broken|failing|throws?)\b/i
const CODE_EXTENSION = /\.(?:c?js|mjs|cts|mts|ts|py)$/i
const TEST_PATH = /(?:^|\/)(?:.+[._-](?:test|spec)|(?:test|spec)[._-].+)\.(?:c?js|mjs|cts|mts|ts|py)$/i
const MAX_DEBUG_FILE_BYTES = 128 * 1024
const MAX_DEBUG_FILES = 4
const OUTPUT_LIMIT = 6_000

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

function bounded(value: unknown, maximum = OUTPUT_LIMIT): string {
  return String(value ?? '').slice(0, maximum)
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
    return Object.freeze({ path, command: `node --experimental-strip-types ${shellQuote(path)}`, runtime: 'node' })
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
 * Non-code and empty payloads are dropped so logs never become edit authority.
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
    const admitted = admissibleFile({ path, content })
    if (!admitted || seen.has(admitted.path)) continue
    seen.add(admitted.path)
    files.push(admitted)
    if (files.length >= MAX_DEBUG_FILES) break
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
  if (admitted.length < 1 || admitted.length > MAX_DEBUG_FILES) return null
  const proofSource = admitted.find(file => TEST_PATH.test(file.path)) ?? admitted[0]
  const proof = debugCommand(proofSource.path)
  if (!proof) return null
  return Object.freeze({
    ...proof,
    files: Object.freeze(admitted.map(file => file.path)),
  })
}

function balancedJsonObjects(value: string): readonly string[] {
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

function parseSingleEdit(
  value: string | null,
  allowedPaths: readonly string[],
): Readonly<{ path: string; search: string; replace: string }> | null {
  const normalized = normalizeBuilderControlOutput(value)
  const raw = String(normalized || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const allowed = new Set(allowedPaths)
  for (const candidate of [raw, ...balancedJsonObjects(raw)]) {
    try {
      const decoded = JSON.parse(candidate)
      const record = Array.isArray(decoded) && decoded.length === 1 ? decoded[0] : decoded
      if (!record || typeof record !== 'object' || Array.isArray(record)) continue
      const control = record as Record<string, unknown>
      const toolId = text(control.toolId) || text(control.tool_id) || text(control.tool) || text(control.action)
      const inputValue = control.input ?? control.arguments ?? control.args
      let input: Record<string, unknown> | null = null
      if (inputValue && typeof inputValue === 'object' && !Array.isArray(inputValue)) input = inputValue as Record<string, unknown>
      if (typeof inputValue === 'string') {
        try {
          const parsed = JSON.parse(inputValue)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) input = parsed as Record<string, unknown>
        } catch {}
      }
      if (!input || toolId !== 'edit_file') continue
      const path = text(input.path) || text(input.filePath) || text(input.filename)
      const search = text(input.search)
      const replace = typeof input.replace === 'string' ? input.replace : ''
      if (!allowed.has(path) || !search) continue
      return Object.freeze({ path, search, replace })
    } catch {}
  }
  return null
}

function summarizeFiles(files: readonly Pick<BuilderFile, 'path' | 'updatedAt'>[]): unknown {
  return files.map(file => ({ path: file.path, updatedAt: file.updatedAt }))
}

function runFailureTrace(round: number, command: string, result: Awaited<ReturnType<BuilderRunnerPort['run']>>): BuilderToolTrace {
  return Object.freeze({
    round,
    toolId: 'run',
    input: { command },
    ok: false,
    output: {
      exitCode: result.exitCode,
      stdout: bounded(result.stdout, 16_000),
      stderr: bounded(result.stderr, 16_000),
      timedOut: result.timedOut,
    },
    error: `builder_command_failed: exit ${result.exitCode}`,
    failureClass: result.timedOut ? 'runtime' : 'test',
    remediation: 'Apply one minimal edit to the attached file that caused the failure, then rerun the exact same command.',
  })
}

function runSuccessTrace(round: number, command: string, result: Awaited<ReturnType<BuilderRunnerPort['run']>>): BuilderToolTrace {
  return Object.freeze({
    round,
    toolId: 'run',
    input: { command },
    ok: true,
    output: {
      exitCode: result.exitCode,
      stdout: bounded(result.stdout, 16_000),
      stderr: bounded(result.stderr, 16_000),
      timedOut: result.timedOut,
    },
  })
}

async function readPlannedFiles(
  workspace: BuilderWorkspacePort,
  workspaceId: string,
  paths: readonly string[],
): Promise<{ files: BuilderFile[]; missing: string | null }> {
  const files: BuilderFile[] = []
  for (const path of paths) {
    const source = await workspace.readFile(workspaceId, path)
    if (!source) return { files, missing: path }
    files.push(source)
  }
  return { files, missing: null }
}

/**
 * Bounded debug protocol: read the attached source set (≤4 files), run the proof command once,
 * make at most one edit on any attached file, rerun the exact command, then stop.
 * No knowledge retrieval, live search, platform explanation, or extra inspection is available.
 */
export async function runDebugFileJob(input: {
  objective: string
  workspaceId: string
  plan: DebugFilePlan
  workspace: BuilderWorkspacePort
  runner: BuilderRunnerPort
  ai: BuilderAiPort
}): Promise<BuilderLoopResult> {
  const trace: BuilderToolTrace[] = []
  const plannedPaths = input.plan.files?.length ? input.plan.files : [input.plan.path]
  const listing = await input.workspace.listFiles(input.workspaceId)
  trace.push(Object.freeze({ round: 1, toolId: 'list_files', input: {}, ok: true, output: summarizeFiles(listing) }))

  const staged = await readPlannedFiles(input.workspace, input.workspaceId, plannedPaths)
  if (staged.missing) {
    trace.push(Object.freeze({
      round: 2,
      toolId: 'read_file',
      input: { path: staged.missing },
      ok: false,
      error: 'builder_file_not_found',
      failureClass: 'path',
      remediation: 'Attach one to four supported source files and retry in the same chat.',
    }))
    return { ok: false, error: 'builder_file_not_found', trace }
  }

  for (const source of staged.files) {
    trace.push(Object.freeze({
      round: 2,
      toolId: 'read_file',
      input: { path: source.path },
      ok: true,
      output: { path: source.path, content: source.content, updatedAt: source.updatedAt },
    }))
  }

  const firstRun = await input.runner.run({
    workspaceId: input.workspaceId,
    command: input.plan.command,
    files: staged.files,
  })
  if (firstRun.exitCode === 0) {
    trace.push(runSuccessTrace(3, input.plan.command, firstRun))
    return {
      ok: true,
      answer: `Debug completed without an edit.\n\nCommand: \`${input.plan.command}\`\nExit code: 0${firstRun.stdout.trim() ? `\nStdout:\n\n\`\`\`\n${bounded(firstRun.stdout)}\n\`\`\`` : ''}`,
      trace,
    }
  }
  trace.push(runFailureTrace(3, input.plan.command, firstRun))

  const sourceBlock = staged.files
    .map(file => `FILE: ${file.path}\nSOURCE:\n${file.content.slice(0, MAX_DEBUG_FILE_BYTES)}`)
    .join('\n\n')
  const systemPrompt = [
    'You are COS Builder in a bounded multi-file debug job.',
    'Return exactly one JSON control object and no prose or Markdown.',
    `The only allowed action is edit_file on one of these paths: ${plannedPaths.join(', ')}.`,
    'Use the smallest unique search/replace that repairs the observed failure.',
    'Schema: {"type":"tool","toolId":"edit_file","input":{"path":"relative/file.ext","search":"small unique existing text","replace":"replacement text"}}.',
    'Do not request another file, command, search, explanation, or platform inspection.',
  ].join(' ')
  const basePrompt = [
    `OBJECTIVE:\n${String(input.objective || '').slice(0, 2_000)}`,
    sourceBlock,
    `COMMAND: ${input.plan.command}`,
    `EXIT CODE: ${firstRun.exitCode}`,
    `STDERR:\n${bounded(firstRun.stderr)}`,
    `STDOUT:\n${bounded(firstRun.stdout)}`,
  ].join('\n\n')

  let edit: Readonly<{ path: string; search: string; replace: string }> | null = null
  let lastResponse: string | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    lastResponse = await input.ai.generate({
      systemPrompt,
      prompt: attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nCONTROL RECOVERY: The previous response was unusable. Emit only the exact edit_file JSON schema.`,
      maxTokens: 2_400,
    })
    edit = parseSingleEdit(lastResponse, plannedPaths)
    if (edit) break
  }
  if (!edit) {
    trace.push(Object.freeze({
      round: 4,
      toolId: 'model_control',
      input: {},
      ok: false,
      output: { responseLength: String(lastResponse || '').length },
      error: 'builder_model_control_schema_mismatch',
      failureClass: 'unknown',
      remediation: 'The reasoner did not return one valid edit_file control after the bounded recovery attempt.',
    }))
    return { ok: false, error: 'builder_model_control_schema_mismatch', trace }
  }

  try {
    const changed = await input.workspace.editFile(input.workspaceId, edit.path, edit.search, edit.replace)
    trace.push(Object.freeze({
      round: 4,
      toolId: 'edit_file',
      input: { path: edit.path, search: edit.search, replace: edit.replace },
      ok: true,
      output: { path: changed.path, updatedAt: changed.updatedAt, bytes: new TextEncoder().encode(changed.content).byteLength },
    }))

    const rerunFiles = staged.files.map(file => file.path === changed.path ? changed : file)
    const secondRun = await input.runner.run({
      workspaceId: input.workspaceId,
      command: input.plan.command,
      files: rerunFiles,
    })
    if (secondRun.exitCode !== 0) {
      trace.push(runFailureTrace(5, input.plan.command, secondRun))
      return { ok: false, error: 'builder_debug_verification_failed', trace }
    }
    trace.push(runSuccessTrace(5, input.plan.command, secondRun))
    const initialError = bounded(firstRun.stderr || firstRun.stdout)
    return {
      ok: true,
      answer: [
        `Debugged \`${edit.path}\` with one minimal edit across ${plannedPaths.length} attached file${plannedPaths.length === 1 ? '' : 's'}.`,
        '',
        `First command: \`${input.plan.command}\``,
        `First exit code: ${firstRun.exitCode}`,
        initialError ? `First stderr/output:\n\n\`\`\`\n${initialError}\n\`\`\`` : '',
        '',
        `Verification command: \`${input.plan.command}\``,
        'Verification exit code: 0',
        secondRun.stdout.trim() ? `Verification stdout:\n\n\`\`\`\n${bounded(secondRun.stdout)}\n\`\`\`` : '',
      ].filter((part, index, values) => part || (index > 0 && values[index - 1] !== '')).join('\n'),
      trace,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'builder_edit_failed'
    trace.push(Object.freeze({
      round: 4,
      toolId: 'edit_file',
      input: { path: edit.path, search: edit.search, replace: edit.replace },
      ok: false,
      error: message,
      failureClass: 'test',
      remediation: 'The single permitted edit could not be applied safely; no further edit was attempted.',
    }))
    return { ok: false, error: message, trace }
  }
}
