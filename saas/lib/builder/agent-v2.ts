import type { BuilderAiPort, BuilderWorkspacePort } from './contracts.ts'
import { checkpointDigest, workspaceDigest } from './checkpoint.ts'
import { BuilderV2Dispatcher, type BuilderV2Action, type BuilderV2Receipt } from './agent-v2-dispatcher.ts'
import { builderTaskContract } from './task-contract.ts'
import { builderCrossFileContractHints } from './cross-file-contract-hints.ts'
import { BUILDER_TURN_TIMEOUT_ERROR } from './control-adapter.ts'

/**
 * Whole-job receipt bound. `maxSteps` is the per-slice budget; a resumed job gets a fresh slice budget on top of
 * its saved receipts. Production 2026-10-16: maxSteps 24 was compared against the saved receipt count, so once a
 * job had 24 receipts every later slice resumed with zero steps and paused again without progress.
 */
export const BUILDER_V2_MAX_RECEIPTS = 400
/** Consecutive receipts that neither changed a file nor passed a command. Debugging (failed run, several reads,
 * a missed edit) is normal work; only a long run with no change and no passing run is a stall, which pauses. */
export const BUILDER_V2_STALL_LIMIT = 20
const REJECTION_LIMIT = 3
const REPEAT_LIMIT = 4
const TAIL = 8
/**
 * A failed model call (timeout, outage, empty reply) is retried in place before the slice gives up, as Cline does
 * (sdk/packages/agents/src/agent-runtime.ts: 3 retries, 1s doubling, capped at 15s). Production 2026-10-17: one empty
 * reply ("builder coding AI provider returned no text") ended an OrderFlow job at slice 4 with every file written.
 */
export const BUILDER_V2_MODEL_RETRIES = 3
/**
 * Working set, as Aider keeps the files "in the chat" and the test output on every turn (aider/coders/base_coder.py
 * chat_files, commands.py cmd_test). Production 2026-10-17, job 00dd6e7d: once npm test failed the model read the same
 * files 16 times over 5 slices and never edited, because each read pushed the failure output and the earlier reads out
 * of the 8-receipt tail. The prompt now always carries the current failing command output and the current content of
 * the files the model has opened, within a character budget sized for the 16k-token owned model window.
 */
const WORKING_SET_CHARS = 12_000
const FAILURE_OUTPUT_CHARS = 5_000
const MODEL_RETRY_BASE_MS = 1_000
const MODEL_RETRY_MAX_MS = 15_000

const SYSTEM_PROMPT = [
  'You are an autonomous software engineering agent. Each reply carries one or more tool operations, executed in order.',
  'Inspect, write or edit, run the required commands, read real failures and repair them. Never claim verification without a real passing run_tests receipt.',
  'Reply with one JSON object and nothing else. Shapes:',
  '{"type":"tool","action":{"tool":"list_files"}}',
  '{"type":"tool","action":{"tool":"read_file","path":"src/a.js"}}',
  '{"type":"tool","action":{"tool":"search_files","query":"text"}}',
  '{"type":"tool","action":{"tool":"write_file","path":"src/a.js","content":"full file content"}}',
  '{"type":"tool","action":{"tool":"edit_file","path":"src/a.js","search":"exact existing text","replace":"new text"}}',
  '{"type":"tool","action":{"tool":"run_tests","command":"npm test"}}',
  '{"type":"tool","action":{"tool":"browser_cli","action":"open","url":"https://itmounts.com"}}',
  '{"type":"tool","action":{"tool":"browser_cli","action":"snapshot"}}',
  '{"type":"tools","actions":[{"tool":"write_file","path":"package.json","content":"..."},{"tool":"write_file","path":"src/a.js","content":"..."}]}',
  '{"type":"finish","summary":"what was built and verified"}',
  'Batch: write several missing files in one "tools" reply (complete contents, no placeholders, dependencies and package.json first), up to 4 actions and about 8000 characters per reply so it fits the output limit. Execution stops at the first failed action.',
  'After a change, once every required file exists, the host runs the required commands itself and returns their real output; read it and repair.',
  'A write or edit receipt with output.syntaxError means that file does not parse: fix it first with edit_file.',
  'write_file creates a file; to rewrite an existing file, read_file it first. Prefer edit_file for small changes.',
  'Write every checklist file, then run every checklist command; finish only after all of them pass after your last change.',
  'If the task explicitly requires browser verification of a URL, open that exact URL with browser_cli and then call browser_cli snapshot after your last source change, inspect any browser failure, repair it, then retest before finishing.',
].join('\n')

const hasSyntaxError = (receipt: BuilderV2Receipt) =>
  typeof (receipt.output as { syntaxError?: unknown } | undefined)?.syntaxError === 'string'

/** Older receipts keep only what checkpoint validation and acceptance need, so long builds stay small. */
function compactReceipt(receipt: BuilderV2Receipt): BuilderV2Receipt {
  const output = receipt.output as Record<string, unknown> | undefined
  const kept = receipt.tool === 'run_tests'
    ? output && { exitCode: output.exitCode, timedOut: output.timedOut, requestedCommand: output.requestedCommand, executedCommand: output.executedCommand }
    : receipt.tool === 'browser_cli'
    ? output && { url: output.url, action: output.action, exitCode: output.exitCode, timedOut: output.timedOut }
    : output && typeof output === 'object' && !Array.isArray(output) && typeof output.path === 'string' ? { path: output.path } : undefined
  return { tool: receipt.tool, ok: receipt.ok, changed: receipt.changed, ...(receipt.error ? { error: receipt.error } : {}), ...(kept ? { output: kept } : {}) }
}

export type BuilderV2Checkpoint = Readonly<{
  version: 2
  workspaceId: string
  objectiveDigest: string
  workspaceDigest: string
  steps: readonly BuilderV2Receipt[]
  revision: number
  verifiedRevision: number
  unproductive: number
  lastReceipt: string
  /** Consecutive resumed work slices without a new host receipt or source revision. */
  idleSlices?: number
}>

/** Limit repeated resumptions that execute no tools and make no source changes. */
export function builderV2IdleSliceCount(
  previous: BuilderV2Checkpoint | null,
  current: BuilderV2Checkpoint,
): number {
  if (!previous || previous.version !== 2) return 0
  // Read-only inspection, repeated list/search calls, and failed host runs
  // cannot buy unlimited new work slices. A genuine source edit or a successful
  // host verification is productive; partial writing stays protected by revision.
  if (current.revision > previous.revision) return 0
  const recent = current.steps.slice(previous.steps.length)
  if (recent.some(receipt => receipt.changed ||
    (receipt.tool === 'run_tests' && receipt.ok &&
      (receipt.output as { exitCode?: unknown; timedOut?: unknown } | undefined)?.exitCode === 0 &&
      (receipt.output as { timedOut?: unknown } | undefined)?.timedOut === false))) return 0
  const prior = previous.idleSlices
  return Math.min(24, (Number.isSafeInteger(prior) && prior! >= 0 ? prior! : 0) + 1)
}

/**
 * A resumed job must never trust a checkpoint's claimed verification counters.
 * Rebuild them from host receipts; V1 checkpoints have a different version.
 */
export function validateBuilderV2ReceiptHistory(checkpoint: BuilderV2Checkpoint): boolean {
  if (!Array.isArray(checkpoint.steps) || checkpoint.steps.length > BUILDER_V2_MAX_RECEIPTS) return false
  let revision = 0
  let verifiedRevision = -1
  let unproductive = 0
  for (const receipt of checkpoint.steps) {
    if (!receipt || typeof receipt !== 'object' || typeof receipt.tool !== 'string'
      || typeof receipt.ok !== 'boolean' || typeof receipt.changed !== 'boolean') return false
    if (receipt.changed && (!receipt.ok || (receipt.tool !== 'write_file' && receipt.tool !== 'edit_file'))) return false
    if (receipt.changed) revision++
    if (receipt.tool === 'run_tests' && receipt.ok) {
      const output = receipt.output as { exitCode?: unknown; timedOut?: unknown } | undefined
      if (!output || output.exitCode !== 0 || output.timedOut !== false) return false
      verifiedRevision = revision
    }
    if (receipt.changed || receipt.tool === 'run_tests' && receipt.ok) unproductive = 0
    else unproductive++
  }
  return checkpoint.revision === revision && checkpoint.verifiedRevision === verifiedRevision
    && checkpoint.unproductive === unproductive
}

export type BuilderV2Acceptance = Readonly<{
  satisfied: boolean
  missingFiles: readonly string[]
  pendingCommands: readonly string[]
  minimumTests: number
  testsPassed: number
  pendingBrowser?: string | null
}>

/**
 * The objective's own checklist decides completion, from host receipts only: every required file exists, every
 * required command passed after the last change, and a passing test run reports at least the requested test count.
 * A passing run alone is not completion — production OrderFlow runs passed tests with 8 of 15 files written.
 */
export function builderV2Acceptance(objective: string, files: readonly string[], steps: readonly BuilderV2Receipt[]): BuilderV2Acceptance {
  const contract = builderTaskContract(objective)
  const lastChange = steps.findLastIndex(receipt => receipt.changed)
  const runs = steps.slice(lastChange + 1).filter(receipt => receipt.tool === 'run_tests')
  // A claimed success is not a proving receipt without actual exit status and timeout evidence.
  const provenRun = (receipt: BuilderV2Receipt) => {
    const output = receipt.output as { exitCode?: unknown; timedOut?: unknown } | undefined
    return receipt.ok && output?.exitCode === 0 && output?.timedOut === false
  }
  const passing = runs.filter(provenRun)
    .map(receipt => receipt.output as { requestedCommand?: unknown; executedCommand?: unknown; stdout?: unknown } | undefined)
  // A more recent failed execution invalidates prior proof until verification succeeds again.
  const latestRunPassed = runs.length > 0 && provenRun(runs[runs.length - 1])
  const missingFiles = contract.files.filter(path => !files.includes(path))
  const pendingCommands = contract.commands.filter(command => {
    const latest = runs.findLast(receipt => {
      const output = receipt.output as { requestedCommand?: unknown; executedCommand?: unknown } | undefined
      return output?.requestedCommand === command || output?.executedCommand === command
    })
    return !latest || !provenRun(latest)
  })
  const testsPassed = Math.max(0, ...passing.map(output => {
    const stdout = typeof output?.stdout === 'string' ? output.stdout : ''
    const pass = /(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/.exec(stdout)
    const fail = /(?:^|\n)\s*(?:#|ℹ)\s+fail\s+(\d+)/.exec(stdout)
    return pass && (!fail || fail[1] === '0') ? Number(pass[1]) : 0
  }))
  // Browser-dependent tasks require a host browser receipt for the requested URL
  // after the last source mutation. A green unit suite cannot substitute for UI proof.
  const browserMatch = /(?:browser|playwright|visual)[^\n]{0,160}?(https:\/\/[^\s),]+)/i.exec(objective)
  const browserTarget = browserMatch?.[1]?.replace(/[.]+$/, '')
  const browserRuns = steps.slice(lastChange + 1).filter(receipt => receipt.tool === 'browser_cli')
  const browserOutput = (receipt: BuilderV2Receipt | undefined) =>
    receipt?.output as { action?: unknown; url?: unknown; exitCode?: unknown; timedOut?: unknown } | undefined
  const isProvenBrowserAction = (receipt: BuilderV2Receipt | undefined) =>
    receipt?.ok === true && browserOutput(receipt)?.exitCode === 0 &&
    browserOutput(receipt)?.timedOut === false
  // A snapshot doesn't navigate; it proves a page only after a real successful
  // open/goto to the exact requested URL, with no intervening navigation.
  const latestNavigationIndex = browserRuns.findLastIndex(receipt =>
    browserOutput(receipt)?.action === 'open' || browserOutput(receipt)?.action === 'goto')
  const navigation = latestNavigationIndex >= 0 ? browserRuns[latestNavigationIndex] : undefined
  const latestSnapshot = latestNavigationIndex >= 0
    ? browserRuns.slice(latestNavigationIndex + 1).findLast(receipt => browserOutput(receipt)?.action === 'snapshot')
    : undefined
  const browserSatisfied = !browserTarget || (
    browserOutput(navigation)?.url === browserTarget &&
    isProvenBrowserAction(navigation) && isProvenBrowserAction(latestSnapshot)
  )
  return {
    satisfied: latestRunPassed && browserSatisfied && missingFiles.length === 0
      && pendingCommands.length === 0 && testsPassed >= contract.minimumTests,
    missingFiles, pendingCommands, minimumTests: contract.minimumTests, testsPassed,
    pendingBrowser: browserTarget && !browserSatisfied ? browserTarget : null,
  }
}

type Decision = Readonly<{ type: 'tool'; actions: readonly BuilderV2Action[] }> | Readonly<{ type: 'finish'; summary: string }>
const MAX_BATCH = 6
export type BuilderV2Outcome = Readonly<{
  ok: boolean
  reason: string
  steps: readonly BuilderV2Receipt[]
  summary?: string
  checkpoint?: BuilderV2Checkpoint
}>

/**
 * The control object a model returned. Coding models commonly wrap their JSON in a ```json fence or emit a
 * reasoning block first; one such reply must not end a whole build. Only a complete JSON object is accepted.
 */
function controlObject(value: string): unknown {
  // Drop only a leading reasoning block. Fences around the object need no stripping: the balanced-object scan
  // below skips quoted strings, so ``` inside a write_file/edit_file payload reaches the dispatcher unchanged.
  const text = value.replace(/^\s*<think>[\s\S]*?<\/think>/i, '').trim()
  try { return JSON.parse(text) } catch { /* fall through to the first balanced object */ }
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0
    let quoted = false
    for (let at = start; at < text.length; at++) {
      const char = text[at]
      if (quoted) {
        if (char === '\\') at++
        else if (char === '"') quoted = false
        continue
      }
      if (char === '"') quoted = true
      else if (char === '{') depth++
      else if (char === '}' && --depth === 0) {
        try { return JSON.parse(text.slice(start, at + 1)) } catch { break }
      }
    }
  }
  return null
}

function parseAction(value: unknown): BuilderV2Action | null {
  if (!value || typeof value !== 'object') return null
  const a = value as Record<string, unknown>
  if (a.tool === 'list_files') return { tool: 'list_files' }
  if (a.tool === 'read_file' && typeof a.path === 'string') return { tool: 'read_file', path: a.path }
  if (a.tool === 'search_files' && typeof a.query === 'string') return { tool: 'search_files', query: a.query }
  if (a.tool === 'write_file' && typeof a.path === 'string' && typeof a.content === 'string') return { tool: 'write_file', path: a.path, content: a.content }
  if (a.tool === 'edit_file' && typeof a.path === 'string' && typeof a.search === 'string' && typeof a.replace === 'string') return { tool: 'edit_file', path: a.path, search: a.search, replace: a.replace }
  if (a.tool === 'run_tests' && typeof a.command === 'string') return { tool: 'run_tests', command: a.command }
  if (a.tool === 'browser_cli' && typeof a.action === 'string'
      && ['open','goto','snapshot','find','console','requests','close'].includes(a.action)
      && (a.url === undefined || typeof a.url === 'string')
      && (a.query === undefined || typeof a.query === 'string'))
    return {
      tool:'browser_cli',action:a.action as 'open'|'goto'|'snapshot'|'find'|'console'|'requests'|'close',
      ...(typeof a.url === 'string' ? {url:a.url} : {}),
      ...(typeof a.query === 'string' ? {query:a.query} : {}),
    }
  return null
}

/**
 * Complete action objects of a "tools" reply that was cut off (model token limit), like a streaming action parser
 * (Bolt executes each <boltAction> as soon as it closes): every complete action before the cut is kept, the partial
 * one is dropped, and the receipts tell the model what still has to be written.
 */
function salvageActions(value: string): BuilderV2Action[] {
  const key = value.search(/"actions"\s*:\s*\[/)
  if (key < 0) return []
  const actions: BuilderV2Action[] = []
  let at = value.indexOf('[', key) + 1
  while (at < value.length && actions.length < MAX_BATCH) {
    const start = value.indexOf('{', at)
    if (start < 0) break
    let depth = 0
    let quoted = false
    let end = -1
    for (let i = start; i < value.length; i++) {
      const char = value[i]
      if (quoted) {
        if (char === '\\') i++
        else if (char === '"') quoted = false
        continue
      }
      if (char === '"') quoted = true
      else if (char === '{') depth++
      else if (char === '}' && --depth === 0) { end = i; break }
    }
    if (end < 0) break
    let parsed: unknown = null
    try { parsed = JSON.parse(value.slice(start, end + 1)) } catch { break }
    const action = parseAction(parsed)
    if (!action) break
    actions.push(action)
    at = end + 1
  }
  return actions
}

function parseDecision(value: string | null): Decision | null {
  if (!value) return null
  const object = controlObject(value)
  if (object && typeof object === 'object') {
    const v = object as Record<string, unknown>
    if (v.type === 'finish' && typeof v.summary === 'string') return { type: 'finish', summary: v.summary }
    if (v.type === 'tool') {
      const action = parseAction(v.action)
      return action ? { type: 'tool', actions: [action] } : null
    }
    if (v.type === 'tools' && Array.isArray(v.actions)) {
      const actions = v.actions.slice(0, MAX_BATCH).map(parseAction)
      return actions.length && actions.every(Boolean) ? { type: 'tool', actions: actions as BuilderV2Action[] } : null
    }
  }
  // No complete control object (for example a "tools" reply cut off mid-file): keep its complete actions.
  const salvaged = salvageActions(value.replace(/^\s*<think>[\s\S]*?<\/think>/i, ''))
  return salvaged.length ? { type: 'tool', actions: salvaged } : null
}

/** Pure recovery ordering for bounded symbolic execution and tests. */
export function builderV2RecoveryPriority(input: {
  failedSuite: boolean
  namedTest: string | null
  importedModules: readonly string[]
  existingFiles: readonly string[]
  previouslyOpened: readonly string[]
}): string[] {
  const targets = input.failedSuite && input.namedTest && input.existingFiles.includes(input.namedTest)
    ? [input.namedTest, ...input.importedModules.filter(path => input.existingFiles.includes(path))]
    : []
  return [...new Set([...targets, ...input.previouslyOpened])]
}

/**
 * Minimal Cursor-style model/tool/feedback loop.
 * Only host-executed, successful verification after the most recent edit
 * allows completion. A no-op write cannot mint progress indefinitely.
 */
export class BuilderV2Agent {
  constructor(private readonly ai: BuilderAiPort, private readonly dispatcher: BuilderV2Dispatcher, private readonly workspace?: BuilderWorkspacePort) {}

  async run(options: {
    workspaceId: string
    objective: string
    maxSteps?: number
    signal?: AbortSignal
    checkpoint?: BuilderV2Checkpoint
    onCheckpoint?: (checkpoint: BuilderV2Checkpoint) => Promise<void>
    /** Wait between model retries; tests pass an instant one. */
    retryDelay?: (ms: number, signal?: AbortSignal) => Promise<void>
  }): Promise<BuilderV2Outcome> {
    const saved = options.checkpoint
    if (saved) {
      if (!this.workspace || saved.version !== 2 || saved.workspaceId !== options.workspaceId || saved.objectiveDigest !== checkpointDigest(options.objective)) {
        return { ok: false, reason: 'builder_v2_checkpoint_scope_mismatch', steps: [] }
      }
      if (saved.workspaceDigest !== await workspaceDigest(this.workspace, options.workspaceId)) {
        return { ok: false, reason: 'builder_v2_checkpoint_workspace_changed', steps: [] }
      }
      if (!validateBuilderV2ReceiptHistory(saved) || [saved.revision, saved.verifiedRevision, saved.unproductive].some(n => !Number.isSafeInteger(n) || n < -1 || n > BUILDER_V2_MAX_RECEIPTS)) {
        return { ok: false, reason: 'builder_v2_checkpoint_invalid', steps: [] }
      }
    }
    const steps: BuilderV2Receipt[] = [...(saved?.steps || [])]
    const maxSteps = Math.max(1, Math.min(options.maxSteps ?? 60, BUILDER_V2_MAX_RECEIPTS))
    let revision = saved?.revision ?? 0
    let verifiedRevision = saved?.verifiedRevision ?? -1
    let unproductive = saved?.unproductive ?? 0
    let lastReceipt = saved?.lastReceipt ?? ''
    const snapshot = async (): Promise<BuilderV2Checkpoint | undefined> => {
      if (!this.workspace) return undefined
      const lastChange = steps.findLastIndex(receipt => receipt.changed)
      return {
        version: 2, workspaceId: options.workspaceId,
        objectiveDigest: checkpointDigest(options.objective),
        workspaceDigest: await workspaceDigest(this.workspace, options.workspaceId),
        steps: steps.map((receipt, at) => at < lastChange && at < steps.length - TAIL ? compactReceipt(receipt) : receipt),
        revision, verifiedRevision, unproductive, lastReceipt,
        idleSlices: saved?.idleSlices ?? 0,
      }
    }
    const checklist = builderTaskContract(options.objective)
    const knownFiles = this.workspace ? (await this.workspace.listFiles(options.workspaceId)).map(file => file.path) : []
    const missingFiles = () => checklist.files.filter(path => !knownFiles.includes(path))
    // Feedback that is not a receipt (rejected finish, unparseable reply, repeated action) keeps the build going
    // with the exact reason, and each kind is bounded so a model that keeps doing it still ends.
    let checklistRejections = 0
    let invalidReplies = 0
    let repeats = 0
    // Actions taken since the last file change, with their receipts: repeating one cannot produce new information.
    const sinceChange = new Map<string, string>()
    // Reconstruct the most recent failed host command even when subsequent reads obscured
    // lastReceipt. A repaired source revision invalidates this diagnostic automatically.
    const failedOnRevision = () => steps.slice(steps.findLastIndex(step => step.changed) + 1)
      .findLast(step => step.tool === 'run_tests' && !step.ok)
    const currentFailure = () => {
      const failed = failedOnRevision()
      const out = failed?.output as { requestedCommand?: unknown; exitCode?: unknown; stdout?: unknown; stderr?: unknown } | undefined
      // Head and tail of the output, as Codex and Cline keep long command output; the only copy in the prompt.
      return out ? JSON.stringify({ command: out.requestedCommand, exitCode: out.exitCode,
        output: headAndTail(`${String(out.stdout ?? '')}\n${String(out.stderr ?? '')}`.trim(), FAILURE_OUTPUT_CHARS) }) : ''
    }
    // Reconstruct inspection history across claims. Otherwise each continuation repeats list_files
    // as if the previous slice never happened, consuming all 24 allowed claims.
    for (const receipt of steps.slice(steps.findLastIndex(item => item.changed) + 1)) {
      if (receipt.tool === 'list_files' && receipt.ok) {
        sinceChange.set(JSON.stringify({ tool: 'list_files' }), JSON.stringify(receipt).slice(0, 20_000))
      }
      // Preserve observed reads across slices to prevent redundant inspect/read loops.
      if (receipt.tool === 'read_file' && receipt.ok && typeof (receipt.output as { path?: unknown } | undefined)?.path === 'string') {
        sinceChange.set(JSON.stringify({ tool: 'read_file', path: (receipt.output as { path: string }).path }), JSON.stringify(receipt).slice(0, 20_000))
      }
    }
    // Content the model has observed per path, for the read-before-overwrite rule.
    const seen = new Map<string, string>()
    const record = (action: BuilderV2Action, receipt: BuilderV2Receipt) => {
      steps.push(receipt)
      if (receipt.changed && action.tool === 'write_file' && !knownFiles.includes(action.path)) knownFiles.push(action.path)
      if (receipt.changed) revision++
      if (receipt.changed && (action.tool === 'write_file' || action.tool === 'edit_file')) {
        const syntaxError = (receipt.output as { syntaxError?: unknown } | undefined)?.syntaxError
        if (typeof syntaxError === 'string') syntaxErrors.set(action.path, syntaxError)
        else syntaxErrors.delete(action.path)
      }
      if (action.tool === 'run_tests') verifiedRevision = receipt.ok ? revision : -1
      lastReceipt = JSON.stringify(receipt).slice(0, 20_000)
      const output = receipt.output as { content?: unknown; currentContent?: unknown } | undefined
      if (action.tool === 'read_file' && receipt.ok && typeof output?.content === 'string') seen.set(action.path, output.content)
      if (action.tool === 'write_file' && typeof output?.currentContent === 'string') seen.set(action.path, output.currentContent)
      if (action.tool === 'write_file' && receipt.changed) seen.set(action.path, action.content)
      if (action.tool === 'edit_file' && receipt.changed) seen.delete(action.path)
      if (receipt.changed) { sinceChange.clear(); repeats = 0 } else if (action.tool !== 'run_tests') sinceChange.set(JSON.stringify(action), lastReceipt)
      if (receipt.changed || action.tool === 'run_tests' && receipt.ok) unproductive = 0
      else unproductive++
    }
    const persist = async () => {
      if (!options.onCheckpoint) return
      const checkpoint = await snapshot()
      if (checkpoint) await options.onCheckpoint(checkpoint)
    }
    // The revision the host last ran the required commands on; each revision is host-verified at most once.
    // Do not rerun a failed command just because another execution slice claimed this job.
    // Every host receipt is revision-bound by the latest changed file.
    // Host-owned, durable verification: command receipts are scoped to the
    // latest source revision. Never repeat a successful command after resume.
    const syntaxErrors = new Map<string, string>()
    const currentRevisionRuns = () => steps.slice(steps.findLastIndex(step => step.changed) + 1)
      .filter(step => step.tool === 'run_tests')
    const latestCommandRun = (command: string) => currentRevisionRuns().findLast(step => {
      const output = step.output as { requestedCommand?: unknown; executedCommand?: unknown } | undefined
      return output?.requestedCommand === command || output?.executedCommand === command
    })
    const verifiedNow = async (): Promise<BuilderV2Outcome | null> => {
      const acceptance = builderV2Acceptance(options.objective, knownFiles, steps)
      return acceptance.satisfied && missingFiles().length === 0
        ? { ok: true, reason: 'verified', summary: 'Every required command passed on the host after the latest source change.', steps, checkpoint: await snapshot() }
        : null
    }
    const hostVerificationDue = () => checklist.files.length > 0
      && missingFiles().length === 0 && checklist.commands.length > 0 && syntaxErrors.size === 0
      && checklist.commands.some(command => !latestCommandRun(command))
      && !currentRevisionRuns().some(step => !step.ok)
    const hostVerify = async (): Promise<BuilderV2Outcome | null> => {
      for (const command of checklist.commands) {
        if (latestCommandRun(command)?.ok) continue
        if (latestCommandRun(command) && !latestCommandRun(command)?.ok) return null
        if (steps.length >= BUILDER_V2_MAX_RECEIPTS) return null
        const action: BuilderV2Action = { tool: 'run_tests', command }
        const receipt = await this.dispatcher.dispatch(options.workspaceId, action)
        record(action, receipt)
        await persist()
        if (!receipt.ok) return null
      }
      return verifiedNow()
    }
    /** The failing command since the last change and the files the model has opened, freshly read, newest first. */
    const workingSet = async () => {
      const failure = failedOnRevision()
      const opened = [...new Set(steps.filter(step => (step.tool === 'read_file' || step.tool === 'edit_file') && step.ok)
        .map(step => (step.output as { path?: unknown } | undefined)?.path).filter((path): path is string => typeof path === 'string').reverse())]
      // Put files named by real failing test diagnostics ahead of incidental reads.
      const details = failure?.output as { stdout?: unknown; stderr?: unknown } | undefined
      const diagnostic = String(details?.stdout ?? '') + '\n' + String(details?.stderr ?? '')
      const failingTests = [...diagnostic.matchAll(/(?:^|[\s(])((?:test|tests)\/[A-Za-z0-9_./-]+\.(?:test|spec)\.[cm]?js)\b/gm)]
        .map(match => match[1]).filter(path => knownFiles.includes(path))
      const targeted: string[] = []
      for (const testPath of failingTests.slice(0, 3)) {
        if (!targeted.includes(testPath)) targeted.push(testPath)
        const testFile = await this.workspace?.readFile(options.workspaceId, testPath)
        if (!testFile) continue
        for (const found of testFile.content.matchAll(/require\(['"](?:\.\.\/)+(src\/[A-Za-z0-9_./-]+\.[cm]?js)['"]\)/g)) {
          if (knownFiles.includes(found[1]) && !targeted.includes(found[1])) targeted.push(found[1])
        }
      }
      // A failing test should not cost another model turn per source read. Supply the
      // bounded test and source files directly from the trusted workspace on each
      // repair turn; the model can edit immediately, with no read-only exploration.
      if (failure && this.workspace) {
        for (const testPath of failingTests.slice(0, 3)) {
          if (!targeted.includes(testPath)) targeted.push(testPath)
        }
        // When Node omits a test filename from the diagnostic, include the
        // small project's known source and test entrypoints as repair context.
        if (!targeted.length) {
          targeted.push(...knownFiles.filter(path => /^(?:src|test)\/[A-Za-z0-9_./-]+\.[cm]?js$/.test(path)).slice(0, 10))
        }
      }
      const prioritized = builderV2RecoveryPriority({
        failedSuite: Boolean(failure),
        namedTest: targeted[0] ?? null,
        importedModules: targeted.slice(1),
        existingFiles: knownFiles,
        previouslyOpened: failure ? [...targeted, ...opened, ...knownFiles.filter(path => path.startsWith('src/') && path.endsWith('.js')).slice(0, 8)] : opened,
      })
      const openFiles: Record<string, string> = {}
      let used = 0
      for (const path of prioritized) {
        const file = this.workspace ? await this.workspace.readFile(options.workspaceId, path) : null
        if (!file || used + file.content.length > WORKING_SET_CHARS) continue
        openFiles[path] = file.content
        used += file.content.length
      }
      return {
        failure,
        open: new Set(Object.keys(openFiles)),
        prompt: used ? { openFiles } : {},
      }
    }
    // Derive repair targets from the actual failing test imports, never from
    // filename conventions. This remains available on every continuation slice.
    const activeRepair = async () => {
      const failure = failedOnRevision()
      if (!failure || !this.workspace) return null
      const output = failure.output as { stdout?: unknown; stderr?: unknown } | undefined
      const diagnostic = String(output?.stdout ?? '') + '\n' + String(output?.stderr ?? '')
      const namedTests = [...new Set([...diagnostic.matchAll(/(?:^|[\s(])((?:test|tests)\/[A-Za-z0-9_./-]+\.(?:test|spec)\.[cm]?js)\b/gm)]
        .map(match => match[1]).filter(path => knownFiles.includes(path)))]
      const targets: Array<{ test: string; sources: string[] }> = []
      for (const testPath of namedTests.slice(0, 4)) {
        const file = await this.workspace.readFile(options.workspaceId, testPath)
        if (!file) continue
        const sources = [...file.content.matchAll(/(?:require\(\s*['"]|from\s*['"])(\.\.\/src\/[A-Za-z0-9_./-]+)(?:['"])/g)]
          .map(match => match[1].replace(/^\.\.\//, ''))
          .map(path => /\.[cm]?js$/.test(path) ? path : path + '.js')
          .filter(path => knownFiles.includes(path))
        targets.push({ test: testPath, sources: [...new Set(sources)] })
      }
      const error = /(?:TypeError|ReferenceError|SyntaxError):[^\n]*/.exec(diagnostic)?.[0] ?? diagnostic.slice(0, 280)
      return { error, targets, instruction: 'Use the actual test import and source export to diagnose the failure. Prefer a targeted edit_file operation; avoid repeating read_file calls. Do not change tests merely to silence failures. Host verification runs after edits.' }
    }
    for (let calls = 0; calls < maxSteps && steps.length < BUILDER_V2_MAX_RECEIPTS; calls++) {
      if (options.signal?.aborted) return { ok: false, reason: 'builder_v2_cancelled', steps, checkpoint: await snapshot() }
      const completed = await verifiedNow()
      if (completed) return completed
      // REA-inspired native harness: the host verifies complete work before asking a model
      // for another action. Avoids an entire provider round-trip and timeout per command.
      if (hostVerificationDue()) {
        const verified = await hostVerify()
        if (verified) return verified
        // A failed host test is supplied to the model on this same turn for actual repair.
      }
      const working = await workingSet()
      let raw: string | null
      try {
        raw = await this.generateWithRetry({
          systemPrompt: SYSTEM_PROMPT,
          prompt: JSON.stringify({
            objective: options.objective,
            ...(checklist.files.length || checklist.commands.length || checklist.minimumTests
              ? { checklist: { files: checklist.files, commands: checklist.commands, minimumTests: checklist.minimumTests } } : {}),
            workspaceId: options.workspaceId,
            workspaceFiles: knownFiles,
            missingRequiredFiles: missingFiles(),
            // Live todo list from host receipts (as Cursor and Windsurf keep a plan the user sees), never from model claims.
            todo: (() => {
              const acceptance = builderV2Acceptance(options.objective, knownFiles, steps)
              return { writeFiles: acceptance.missingFiles, passCommands: acceptance.pendingCommands,
                tests: { passed: acceptance.testsPassed, required: acceptance.minimumTests } }
            })(),
            nextRecommendedAction: missingFiles().length ? { tool: 'tools', actions: missingFiles().slice(0, 4).map(path => ({ tool: 'write_file', path })), instruction: 'Generate these files together in one complete tools reply, respecting the output limit; include full contents for each action.' }
              : steps.slice(steps.findLastIndex(step => step.changed) + 1).some(step => step.tool === 'run_tests' && !step.ok)
                ? { tool: 'edit_file', reason: 'Repair the last failing test before rerunning the unchanged revision' }
                : { tool: 'run_tests', command: checklist.commands[0] ?? 'npm test' },
            instruction: currentFailure()
              ? 'The host has already run the suite on this unchanged revision and recorded the failure in latestFailedTest. The named failing test and its imported module are in openFiles when available. Edit the relevant module to fix the assertion; do not rewrite unrelated manifests.  Do not run the same tests again until an edit changes the revision.'
              : 'Do not list_files again when workspaceFiles is supplied. Write several missingRequiredFiles per "tools" reply; once all exist the host runs the required commands and returns their output.',
            lastReceipt: compactAgainstWorkingSet(lastReceipt, working),
            latestFailedTest: currentFailure(),
            ...(currentFailure() ? { activeRepair: await activeRepair() } : {}),
            ...(currentFailure() ? { crossFileContractHints: await builderCrossFileContractHints(this.workspace, options.workspaceId, knownFiles).catch(() => []), contractHintPolicy: 'These are approximate source-derived API hints, NOT acceptance evidence. Preserve the objective, inspect source and tests, repair production code first, and verify with actual host tests.' } : {}),
            ...working.prompt,
            // Content already in openFiles or latestFailedTest is not repeated from older receipts: it only costs context.
            tail: steps.slice(-TAIL).map(receipt => withoutWorkingSetCopies(receipt, working)),
            verified: verifiedRevision === revision && verifiedRevision >= 0,
            stepsRemaining: BUILDER_V2_MAX_RECEIPTS - steps.length,
          }),
          maxTokens: 4096,
          signal: options.signal,
          // A reply cut off at the limit still carries every complete action before the cut (salvageActions).
          allowTruncatedText: true,
        }, options.retryDelay ?? abortableDelay)
      } catch (error) {
        if (options.signal?.aborted) return { ok: false, reason: 'builder_v2_cancelled', steps, checkpoint: await snapshot() }
        // A reply cut off before any complete action is feedback, like an unparseable reply: ask for less per reply.
        if (error instanceof Error && error.message === 'local_model_output_truncated') {
          if (++invalidReplies >= REJECTION_LIMIT) return { ok: false, reason: 'builder_v2_invalid_model_action', steps, checkpoint: await snapshot() }
          lastReceipt = JSON.stringify({ ok: false, error: 'builder_v2_reply_truncated',
            message: 'Your reply exceeded the output limit and was cut off before any complete action. Send fewer or smaller files per reply.' })
          continue
        }
        // A model timeout or outage is not a build failure: completed work is checkpointed and the next slice resumes.
        // All requested files already exist: host-run the mandatory commands even if the model is offline.
        // This is real execution, not a model assertion. Any failing command keeps acceptance FAIL.
        if (hostVerificationDue()) {
          const verified = await hostVerify()
          if (verified) return verified
        }
        return { ok: false, reason: 'builder_v2_model_unavailable', summary: error instanceof Error ? error.message : 'builder_v2_model_error', steps, checkpoint: await snapshot() }
      }
      const decision = parseDecision(raw)
      if (!decision) {
        if (++invalidReplies >= REJECTION_LIMIT) return { ok: false, reason: 'builder_v2_invalid_model_action', steps, checkpoint: await snapshot() }
        lastReceipt = JSON.stringify({ ok: false, error: 'builder_v2_invalid_model_action',
          expected: 'exactly one JSON object in one of the shapes from the instructions', received: String(raw ?? '').slice(0, 500) })
        continue
      }
      invalidReplies = 0
      if (decision.type === 'finish') {
        const verified = verifiedRevision === revision && verifiedRevision >= 0
        const listed = await this.dispatcher.dispatch(options.workspaceId, { tool: 'list_files' })
        const files = Array.isArray(listed.output) ? listed.output.map(file => String((file as { path?: unknown }).path)) : []
        const acceptance = builderV2Acceptance(options.objective, files, steps)
        if (verified && acceptance.satisfied) return { ok: true, reason: 'verified', steps, summary: decision.summary }
        // An early or unverified finish is feedback, not the end of the build: the model receives the exact unmet
        // checklist and keeps working. Not a receipt, so counters rebuilt from receipts on resume stay valid.
        // Bounded so a model that keeps claiming completion ends with the unmet checklist instead of looping.
        const error = verified ? 'builder_v2_checklist_incomplete' : 'builder_v2_unverified_completion'
        if (++checklistRejections >= REJECTION_LIMIT) return { ok: false, reason: error, steps, checkpoint: await snapshot() }
        lastReceipt = JSON.stringify({ tool: 'finish', ok: false, error, ...acceptance,
          next: acceptance.missingFiles.length ? ['write_file'] : acceptance.pendingBrowser ? ['browser_cli', 'edit_file', 'run_tests'] : ['run_tests', 'edit_file'] }).slice(0, 20_000)
        continue
      }
      // Execute the reply's actions in order. The first failed or repeated action ends the batch, so later actions
      // never run against a state the model did not expect; the receipts so far go back to the model.
      for (const action of decision.actions) {
        if (steps.length >= BUILDER_V2_MAX_RECEIPTS) break
        // Stop an expensive repair loop before it can consume the remaining
        // 24 continuation claims. A failed test permits a few inspections,
        // but another inspection after four read-only receipts must be an edit.
        // Count across checkpoints so restarting a slice does not reset the budget.
        if (failedOnRevision() && (action.tool === 'read_file' || action.tool === 'list_files' || action.tool === 'search_files')) {
          const afterFailure = steps.slice(steps.findLastIndex(step => step.tool === 'run_tests' && !step.ok) + 1)
          const readOnly = afterFailure.filter(step => step.tool === 'read_file' || step.tool === 'list_files' || step.tool === 'search_files').length
          if (readOnly >= 4) {
            // The host already supplies the failing test and relevant source through openFiles.
            // Give the model a bounded opportunity to edit instead of killing an otherwise
            // recoverable job at its first redundant read. No more read receipts are executed.
            if (++repeats >= REPEAT_LIMIT) {
              return { ok: false, reason: 'builder_v2_repair_read_limit', summary: 'Repeated read-only repair attempts after host-supplied test/source context.', steps, checkpoint: await snapshot() }
            }
            lastReceipt = JSON.stringify({
              ok: false, error: 'builder_v2_repair_requires_edit',
              message: 'The failing test and source are already in openFiles. Do not read or rerun tests on this revision. Use edit_file to repair the named implementation; otherwise the job will stop.',
            })
            break
          }
        }
        const signature = JSON.stringify(action)
        // A failed required suite is deterministic for an unchanged source revision.
        // Host verification already captured its exit code/output. Do not spend more
        // sandbox calls repeating the same failure; require an edit before rerun.
        if (action.tool === 'run_tests' && steps.slice(steps.findLastIndex(step => step.changed) + 1)
          .some(step => step.tool === 'run_tests' && !step.ok && (step.output as { requestedCommand?: unknown } | undefined)?.requestedCommand === action.command)) {
          if (++repeats >= REPEAT_LIMIT) return { ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot() }
          lastReceipt = JSON.stringify({ ok: false, error: 'builder_v2_unchanged_failed_suite',
            message: 'The command already failed on this source revision. Edit the relevant source before rerunning it.',
            command: action.command }).slice(0, 20_000)
          break
        }
        // Commands execute on new revisions: only host receipts can prove verification.
        const previous = action.tool === 'run_tests' ? undefined : sinceChange.get(signature)
        if (previous !== undefined) {
          // Nothing changed since this exact action ran, so it would return the same result (stuck-loop detection
          // as in OpenHands): return that result with the instruction to choose a different step.
          if (++repeats >= REPEAT_LIMIT) return { ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot() }
          lastReceipt = JSON.stringify({ ok: false, error: 'builder_v2_repeated_action',
            message: 'This exact action already ran and no file has changed since; its result is below. Choose a different next step.',
            previous: JSON.parse(previous) }).slice(0, 20_000)
          break
        }
        // Refuse an overwrite the agent has not inspected on this revision.
        // Return recovery feedback without burning a host tool receipt.
        if (action.tool === 'write_file' && knownFiles.includes(action.path) && !seen.has(action.path)) {
          lastReceipt = JSON.stringify({ ok: false, tool: action.tool,
            error: 'builder_write_content_conflict', path: action.path,
            message: 'Read the existing file before overwriting it.' })
          break
        }
        const receipt = await this.dispatcher.dispatch(options.workspaceId, action,
          action.tool === 'write_file' ? { seenContent: seen.get(action.path) } : {})
        record(action, receipt)
        await persist()
        // A stall pauses with its checkpoint for the bounded continuation controller (#4590): the next slice
        // resumes with fresh repeat tracking, and the job's slice cap bounds how often that happens.
        if (unproductive >= BUILDER_V2_STALL_LIMIT) return { ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot() }
        // A file just written with a syntax error is repaired before anything is built on top of it.
        if (!receipt.ok || hasSyntaxError(receipt)) break
      }
      // Host verification, as Lovable observes build and test failures itself: after a change, once every required
      // file exists, the host runs the required commands without spending a model call and returns the real output.
      if (hostVerificationDue()) {
        const verified = await hostVerify()
        if (verified) return verified
        if (unproductive >= BUILDER_V2_STALL_LIMIT) return { ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot() }
      }
    }
    if (steps.length >= BUILDER_V2_MAX_RECEIPTS) return { ok: false, reason: 'builder_v2_step_budget_exhausted', steps, checkpoint: await snapshot() }
    return { ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot() }
  }

  /**
   * One model call, retried with backoff on failure. Never retried: a cancellation, a cut-off reply (handled as
   * feedback), or the slice's own time budget running out (the job cycle pauses and the next slice resumes).
   */
  private async generateWithRetry(request: Parameters<BuilderAiPort['generate']>[0], retryDelay: (ms: number, signal?: AbortSignal) => Promise<void>): Promise<string | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.ai.generate(request)
      } catch (error) {
        if (request.signal?.aborted || attempt >= BUILDER_V2_MODEL_RETRIES
          || (error instanceof Error && (error.message === 'local_model_output_truncated' || error.message === BUILDER_TURN_TIMEOUT_ERROR))) throw error
        await retryDelay(Math.min(MODEL_RETRY_MAX_MS, MODEL_RETRY_BASE_MS * 2 ** attempt), request.signal)
      }
    }
  }
}

type WorkingSet = { failure?: BuilderV2Receipt; open: Set<string> }

/** A receipt whose content the prompt already carries in openFiles or latestFailedTest, with that copy left out. */
function withoutWorkingSetCopies(receipt: BuilderV2Receipt, working: WorkingSet): BuilderV2Receipt {
  const output = receipt.output as { path?: unknown } | undefined
  if (receipt.tool === 'read_file' && working.open.has(String(output?.path))) return { ...receipt, output: { path: output?.path, content: 'see openFiles' } }
  if (receipt === working.failure) return { ...receipt, output: { ...(receipt.output as object), stdout: 'see latestFailedTest', stderr: '' } }
  return receipt
}

/** lastReceipt is the serialized last receipt; when it is a copy of working-set content, send the short form. */
function compactAgainstWorkingSet(lastReceipt: string, working: WorkingSet): string {
  let receipt: BuilderV2Receipt
  try { receipt = JSON.parse(lastReceipt) } catch { return lastReceipt }
  const failureCopy = working.failure && lastReceipt === JSON.stringify(working.failure).slice(0, 20_000)
  const compact = withoutWorkingSetCopies(failureCopy ? working.failure! : receipt, working)
  return compact === receipt || compact === working.failure ? lastReceipt : JSON.stringify(compact)
}

/** Keep the start and the end of long output, as Codex and Cline do (utils/string/src/truncate.rs; output-limits.ts). */
function headAndTail(text: string, max: number): string {
  if (text.length <= max) return text
  const half = Math.floor(max / 2)
  return `${text.slice(0, half)}\n… ${text.length - 2 * half} characters omitted …\n${text.slice(-half)}`
}

/** Resolves after ms, or at once when the job is cancelled (the next model call then sees the aborted signal). */
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  })
}

function describeStep(receipt: BuilderV2Receipt): string {
  const output = receipt.output as { path?: unknown; exitCode?: unknown; requestedCommand?: unknown; syntaxError?: unknown } | undefined
  const path = typeof output?.path === 'string' ? output.path : ''
  if (receipt.tool === 'run_tests') {
    const command = typeof output?.requestedCommand === 'string' ? output.requestedCommand : 'command'
    return `ran \`${command}\` (${receipt.ok ? 'passed' : `exit ${String(output?.exitCode ?? '?')}`})`
  }
  const verb = { write_file: 'wrote', edit_file: 'edited', read_file: 'read', list_files: 'listed files', search_files: 'searched' }[receipt.tool]
  const outcome = !receipt.ok ? ` (failed: ${receipt.error ?? 'error'})` : typeof output?.syntaxError === 'string' ? ' (syntax error)' : ''
  return `${verb}${path ? ` ${path}` : ''}${outcome}`
}

/**
 * The job's progress for the person who started it, from host receipts only (Lovable shows each step of a running
 * build; Cursor shows the task's progress): required files written, each required command's latest real result,
 * tests passing, the last actions and the latest failure output.
 */
export function builderV2ProgressReport(objective: string, files: readonly string[], steps: readonly BuilderV2Receipt[],
  slice?: Readonly<{ current: number; max: number }>): string {
  const contract = builderTaskContract(objective)
  const acceptance = builderV2Acceptance(objective, files, steps)
  const lastChange = steps.findLastIndex(receipt => receipt.changed)
  const lines: string[] = [`Progress${slice ? ` (work slice ${slice.current} of ${slice.max})` : ''}:`]
  if (contract.files.length) {
    const written = contract.files.length - acceptance.missingFiles.length
    const missing = acceptance.missingFiles.slice(0, 5).join(', ') + (acceptance.missingFiles.length > 5 ? ', …' : '')
    lines.push(`- Required files: ${written} of ${contract.files.length} written${missing ? `. Missing: ${missing}` : ''}`)
  }
  if (contract.commands.length) {
    const results = contract.commands.map(command => {
      const at = steps.findLastIndex(receipt => receipt.tool === 'run_tests'
        && (receipt.output as { requestedCommand?: unknown } | undefined)?.requestedCommand === command)
      if (at < 0) return `\`${command}\` not run yet`
      const exit = (steps[at].output as { exitCode?: unknown } | undefined)?.exitCode
      return `\`${command}\` ${steps[at].ok ? 'passed' : `failed (exit ${String(exit ?? '?')})`}${at < lastChange ? ' before the latest change' : ''}`
    })
    lines.push(`- Required commands: ${results.join(' · ')}`)
  }
  if (contract.minimumTests) lines.push(`- Tests passing: ${acceptance.testsPassed} of ${contract.minimumTests} required`)
  if (steps.length) lines.push(`- Last steps: ${steps.slice(-5).map(describeStep).join(' · ')}`)
  const failed = steps.findLast(receipt => receipt.tool === 'run_tests' && !receipt.ok)
  const failedAt = failed ? steps.lastIndexOf(failed) : -1
  if (failed && failedAt > lastChange) {
    const output = failed.output as { stderr?: unknown; stdout?: unknown } | undefined
    const text = [output?.stderr, output?.stdout].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join('\n')
    if (text) lines.push(`- Latest failure output:\n\`\`\`text\n${text.trim().split('\n').slice(-12).join('\n').slice(-1200)}\n\`\`\``)
  }
  return lines.join('\n')
}
