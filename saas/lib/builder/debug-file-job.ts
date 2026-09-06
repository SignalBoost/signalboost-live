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
const WORKSPACE_EXTENSION = /\.(?:c?js|mjs|cts|mts|ts|tsx|jsx|py|html|css|json|sql|sh|bash|java|cpp|cc|cxx|cs|go|rs|php|rb|swift|kt)$/i
const TEST_PATH = /(?:^|\/)(?:.+[._-](?:test|spec)|(?:test|spec)[._-].+)\.(?:c?js|mjs|cts|mts|ts|py)$/i
const MAX_DEBUG_FILE_BYTES = 128 * 1024
const MAX_DEBUG_FILES = 4
const MAX_REPAIR_ITERATIONS = 3
const MAX_CONTROL_ATTEMPTS = 2
const OUTPUT_LIMIT = 6_000

export type DebugFilePlan = Readonly<{
  path: string
  command: string
  runtime: 'node' | 'python3'
  files: readonly string[]
}>

export type DebugFileInput = Readonly<{ path: string; content: string }>

type DebugEdit = Readonly<{ path: string; search: string; replace: string }>

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
  if (/\b(?:run|execute)\b/i.test(prompt)
    || /\b(?:npm|pnpm|yarn|bun)\s+(?:test|start|run|install|ci)\b/i.test(prompt)) return null
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

function parseSingleEdit(value: string | null, allowedPaths: readonly string[]): DebugEdit | null {
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
    remediation: 'Use the latest failure evidence to make the next smallest targeted edit, then rerun the exact same command.',
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

function sourceBlock(files: readonly BuilderFile[]): string {
  return files
    .map(file => `FILE: ${file.path}\nSOURCE:\n${file.content.slice(0, MAX_DEBUG_FILE_BYTES)}`)
    .join('\n\n')
}

function editFingerprint(edit: DebugEdit): string {
  return `${edit.path}\u0000${edit.search}\u0000${edit.replace}`
}

/**
 * Bounded iterative debug protocol: read the attached source set (≤4 files), run the proof command,
 * then make up to three targeted edits across the admitted files. Every successful edit is followed
 * by the exact same proof command; a failed verification becomes evidence for the next repair round.
 * No knowledge retrieval, live search, repository authority, or extra filesystem inspection is available.
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
      remediation: 'Use the supplied file set already present in this workspace; if a required file is absent, the caller must add it before Builder can edit it.',
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

  let currentFiles = staged.files
  const firstRun = await input.runner.run({
    workspaceId: input.workspaceId,
    command: input.plan.command,
    files: currentFiles,
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

  const initialError = bounded(firstRun.stderr || firstRun.stdout)
  const attemptedEdits = new Set<string>()
  const changedPaths: string[] = []
  let latestRun = firstRun
  let latestEditError = ''
  let round = 4

  const systemPrompt = [
    'You are COS Builder in a bounded iterative multi-file debug job.',
    'Return exactly one JSON control object and no prose or Markdown.',
    `The only allowed action is edit_file on one of these paths: ${plannedPaths.join(', ')}.`,
    'Use the smallest unique search/replace justified by the latest failure evidence.',
    'The same proof command is rerun after every applied edit. If the previous edit did not fully fix the test, diagnose the new failure and choose the next smallest edit, which may be in a different admitted file.',
    'Schema: {"type":"tool","toolId":"edit_file","input":{"path":"relative/file.ext","search":"small unique existing text","replace":"replacement text"}}.',
    'Do not request another file, command, search, explanation, or platform inspection.',
  ].join(' ')

  for (let repairIteration = 1; repairIteration <= MAX_REPAIR_ITERATIONS; repairIteration += 1) {
    const basePrompt = [
      `OBJECTIVE:\n${String(input.objective || '').slice(0, 2_000)}`,
      `REPAIR ITERATION: ${repairIteration} of ${MAX_REPAIR_ITERATIONS}`,
      sourceBlock(currentFiles),
      `COMMAND: ${input.plan.command}`,
      `LATEST EXIT CODE: ${latestRun.exitCode}`,
      `LATEST STDERR:\n${bounded(latestRun.stderr)}`,
      `LATEST STDOUT:\n${bounded(latestRun.stdout)}`,
      changedPaths.length ? `ALREADY CHANGED FILES: ${changedPaths.join(', ')}` : '',
      latestEditError ? `LATEST EDIT APPLICATION ERROR:\n${bounded(latestEditError)}` : '',
    ].filter(Boolean).join('\n\n')

    let edit: DebugEdit | null = null
    let lastResponse: string | null = null
    for (let controlAttempt = 0; controlAttempt < MAX_CONTROL_ATTEMPTS; controlAttempt += 1) {
      const recovery = controlAttempt === 0
        ? ''
        : '\n\nCONTROL RECOVERY: The previous response was unusable, unsafe, or repeated. Emit only a new valid edit_file JSON object using current source text.'
      lastResponse = await input.ai.generate({
        systemPrompt,
        prompt: `${basePrompt}${recovery}`,
        maxTokens: 2_400,
      })
      const candidate = parseSingleEdit(lastResponse, plannedPaths)
      if (!candidate || attemptedEdits.has(editFingerprint(candidate))) continue
      edit = candidate
      break
    }

    if (!edit) {
      trace.push(Object.freeze({
        round,
        toolId: 'model_control',
        input: { repairIteration },
        ok: false,
        output: { responseLength: String(lastResponse || '').length },
        error: 'builder_model_control_schema_mismatch',
        failureClass: 'unknown',
        remediation: `Builder attempted bounded control recovery during repair iteration ${repairIteration}; no safe new edit was produced.`,
      }))
      return { ok: false, error: 'builder_model_control_schema_mismatch', trace }
    }

    attemptedEdits.add(editFingerprint(edit))
    try {
      const changed = await input.workspace.editFile(input.workspaceId, edit.path, edit.search, edit.replace)
      trace.push(Object.freeze({
        round,
        toolId: 'edit_file',
        input: { path: edit.path, search: edit.search, replace: edit.replace },
        ok: true,
        output: { path: changed.path, updatedAt: changed.updatedAt, bytes: new TextEncoder().encode(changed.content).byteLength },
      }))
      round += 1
      currentFiles = currentFiles.map(file => file.path === changed.path ? changed : file)
      if (!changedPaths.includes(changed.path)) changedPaths.push(changed.path)
      latestEditError = ''
    } catch (error) {
      latestEditError = error instanceof Error ? error.message : 'builder_edit_failed'
      trace.push(Object.freeze({
        round,
        toolId: 'edit_file',
        input: { path: edit.path, search: edit.search, replace: edit.replace },
        ok: false,
        error: latestEditError,
        failureClass: 'test',
        remediation: 'Use the current source text and choose a different minimal edit; do not repeat the failed search/replace.',
      }))
      round += 1
      continue
    }

    latestRun = await input.runner.run({
      workspaceId: input.workspaceId,
      command: input.plan.command,
      files: currentFiles,
    })
    if (latestRun.exitCode === 0) {
      trace.push(runSuccessTrace(round, input.plan.command, latestRun))
      return {
        ok: true,
        answer: [
          `Found and fixed the failure across ${plannedPaths.length} attached file${plannedPaths.length === 1 ? '' : 's'}.`,
          `Repair iterations: ${repairIteration}`,
          `Changed files: ${changedPaths.map(path => `\`${path}\``).join(', ')}`,
          '',
          `First command: \`${input.plan.command}\``,
          `First exit code: ${firstRun.exitCode}`,
          initialError ? `First stderr/output:\n\n\`\`\`\n${initialError}\n\`\`\`` : '',
          '',
          `Verification command: \`${input.plan.command}\``,
          'Verification exit code: 0',
          latestRun.stdout.trim() ? `Verification stdout:\n\n\`\`\`\n${bounded(latestRun.stdout)}\n\`\`\`` : '',
        ].filter((part, index, values) => part || (index > 0 && values[index - 1] !== '')).join('\n'),
        trace,
      }
    }

    trace.push(runFailureTrace(round, input.plan.command, latestRun))
    round += 1
  }

  trace.push(Object.freeze({
    round,
    toolId: 'model_control',
    input: { maxRepairIterations: MAX_REPAIR_ITERATIONS },
    ok: false,
    error: 'builder_debug_repair_budget_exhausted',
    failureClass: latestRun.timedOut ? 'runtime' : 'test',
    remediation: `Builder used all ${MAX_REPAIR_ITERATIONS} bounded repair iterations and preserved the latest verification evidence instead of claiming success.`,
  }))
  return { ok: false, error: 'builder_debug_verification_failed', trace }
}
