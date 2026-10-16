import type { BuilderAiPort, BuilderWorkspacePort } from './contracts.ts'
import { checkpointDigest, workspaceDigest } from './checkpoint.ts'
import { BuilderV2Dispatcher, type BuilderV2Action, type BuilderV2Receipt } from './agent-v2-dispatcher.ts'
import { builderTaskContract } from './task-contract.ts'

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

const SYSTEM_PROMPT = [
  'You are an autonomous software engineering agent. Choose exactly one tool operation per reply.',
  'Inspect, write or edit, run the required commands, read real failures and repair them. Never claim verification without a real passing run_tests receipt.',
  'Reply with one JSON object and nothing else. Shapes:',
  '{"type":"tool","action":{"tool":"list_files"}}',
  '{"type":"tool","action":{"tool":"read_file","path":"src/a.js"}}',
  '{"type":"tool","action":{"tool":"search_files","query":"text"}}',
  '{"type":"tool","action":{"tool":"write_file","path":"src/a.js","content":"full file content"}}',
  '{"type":"tool","action":{"tool":"edit_file","path":"src/a.js","search":"exact existing text","replace":"new text"}}',
  '{"type":"tool","action":{"tool":"run_tests","command":"npm test"}}',
  '{"type":"finish","summary":"what was built and verified"}',
  'write_file creates a file; to rewrite an existing file, read_file it first. Prefer edit_file for small changes.',
  'Write every checklist file, then run every checklist command; finish only after all of them pass after your last change.',
].join('\n')

/** Older receipts keep only what checkpoint validation and acceptance need, so long builds stay small. */
function compactReceipt(receipt: BuilderV2Receipt): BuilderV2Receipt {
  const output = receipt.output as Record<string, unknown> | undefined
  const kept = receipt.tool === 'run_tests'
    ? output && { exitCode: output.exitCode, timedOut: output.timedOut, requestedCommand: output.requestedCommand, executedCommand: output.executedCommand }
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
}>

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
  const passing = runs.filter(receipt => receipt.ok)
    .map(receipt => receipt.output as { requestedCommand?: unknown; executedCommand?: unknown; stdout?: unknown } | undefined)
  // A more recent failed execution invalidates prior proof until verification succeeds again.
  const latestRunPassed = runs.length > 0 && runs[runs.length - 1].ok
  const missingFiles = contract.files.filter(path => !files.includes(path))
  const pendingCommands = contract.commands.filter(command => {
    const latest = runs.findLast(receipt => {
      const output = receipt.output as { requestedCommand?: unknown; executedCommand?: unknown } | undefined
      return output?.requestedCommand === command || output?.executedCommand === command
    })
    return !latest?.ok
  })
  const testsPassed = Math.max(0, ...passing.map(output => {
    const stdout = typeof output?.stdout === 'string' ? output.stdout : ''
    const pass = /(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/.exec(stdout)
    const fail = /(?:^|\n)\s*(?:#|ℹ)\s+fail\s+(\d+)/.exec(stdout)
    return pass && (!fail || fail[1] === '0') ? Number(pass[1]) : 0
  }))
  return {
    satisfied: latestRunPassed && missingFiles.length === 0 && pendingCommands.length === 0 && testsPassed >= contract.minimumTests,
    missingFiles, pendingCommands, minimumTests: contract.minimumTests, testsPassed,
  }
}

type Decision = Readonly<{ type: 'tool'; action: BuilderV2Action }> | Readonly<{ type: 'finish'; summary: string }>
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

function parseDecision(value: string | null): Decision | null {
  if (!value) return null
  const object = controlObject(value)
  if (!object || typeof object !== 'object') return null
  const v = object as Record<string, unknown>
  if (v.type === 'finish' && typeof v.summary === 'string') return { type: 'finish', summary: v.summary }
  if (v.type !== 'tool' || !v.action || typeof v.action !== 'object') return null
  const a = v.action as Record<string, unknown>
  if (a.tool === 'list_files') return { type: 'tool', action: { tool: 'list_files' } }
  if (a.tool === 'read_file' && typeof a.path === 'string') return { type: 'tool', action: { tool: 'read_file', path: a.path } }
  if (a.tool === 'search_files' && typeof a.query === 'string') return { type: 'tool', action: { tool: 'search_files', query: a.query } }
  if (a.tool === 'write_file' && typeof a.path === 'string' && typeof a.content === 'string') return { type: 'tool', action: { tool: 'write_file', path: a.path, content: a.content } }
  if (a.tool === 'edit_file' && typeof a.path === 'string' && typeof a.search === 'string' && typeof a.replace === 'string') return { type: 'tool', action: { tool: 'edit_file', path: a.path, search: a.search, replace: a.replace } }
  if (a.tool === 'run_tests' && typeof a.command === 'string') return { type: 'tool', action: { tool: 'run_tests', command: a.command } }
  return null
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
    // Reconstruct inspection history across claims. Otherwise each continuation repeats list_files
    // as if the previous slice never happened, consuming all 24 allowed claims.
    for (const receipt of steps.slice(steps.findLastIndex(item => item.changed) + 1)) {
      if (receipt.tool === 'list_files' && receipt.ok) {
        sinceChange.set(JSON.stringify({ tool: 'list_files' }), JSON.stringify(receipt).slice(0, 20_000))
      }
    }
    // Content the model has observed per path, for the read-before-overwrite rule.
    const seen = new Map<string, string>()
    for (let calls = 0; calls < maxSteps && steps.length < BUILDER_V2_MAX_RECEIPTS; calls++) {
      if (options.signal?.aborted) return { ok: false, reason: 'builder_v2_cancelled', steps, checkpoint: await snapshot() }
      let raw: string | null
      try {
        raw = await this.ai.generate({
          systemPrompt: SYSTEM_PROMPT,
          prompt: JSON.stringify({
            objective: options.objective,
            ...(checklist.files.length || checklist.commands.length || checklist.minimumTests
              ? { checklist: { files: checklist.files, commands: checklist.commands, minimumTests: checklist.minimumTests } } : {}),
            workspaceId: options.workspaceId,
            workspaceFiles: knownFiles,
            missingRequiredFiles: missingFiles(),
            nextRecommendedAction: missingFiles().length ? { tool: 'write_file', path: missingFiles()[0] } : { tool: 'run_tests', command: checklist.commands[0] ?? 'npm test' },
            instruction: 'Do not list_files again when workspaceFiles is supplied. Create missingRequiredFiles one at a time; execute commands after files exist.',
            lastReceipt,
            tail: steps.slice(-TAIL),
            verified: verifiedRevision === revision && verifiedRevision >= 0,
            stepsRemaining: BUILDER_V2_MAX_RECEIPTS - steps.length,
          }),
          maxTokens: 4096,
          signal: options.signal,
        })
      } catch (error) {
        if (options.signal?.aborted) return { ok: false, reason: 'builder_v2_cancelled', steps, checkpoint: await snapshot() }
        // A model timeout or outage is not a build failure: completed work is checkpointed and the next slice resumes.
        // All requested files already exist: host-run the mandatory commands even if the model is offline.
        // This is real execution, not a model assertion. Any failing command keeps acceptance FAIL.
        if (checklist.files.length && missingFiles().length === 0 && checklist.commands.length) {
          for (const command of checklist.commands) {
            const receipt = await this.dispatcher.dispatch(options.workspaceId, { tool: 'run_tests', command })
            steps.push(receipt)
            verifiedRevision = receipt.ok ? revision : -1
            lastReceipt = JSON.stringify(receipt).slice(0, 20_000)
            if (receipt.changed || receipt.ok) unproductive = 0
            else unproductive++
            if (options.onCheckpoint) {
              const checkpoint = await snapshot()
              if (checkpoint) await options.onCheckpoint(checkpoint)
            }
            if (!receipt.ok) break
          }
          const acceptance = builderV2Acceptance(options.objective, knownFiles, steps)
          if (acceptance.satisfied && verifiedRevision === revision) {
            return { ok: true, reason: 'verified', summary: 'Host commands executed successfully after the latest source change', steps, checkpoint: await snapshot() }
          }
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
          next: acceptance.missingFiles.length ? ['write_file'] : ['run_tests', 'edit_file'] }).slice(0, 20_000)
        continue
      }
      const action = decision.action
      const signature = JSON.stringify(action)
      // Commands always execute: only a host run can prove or revoke verification, never a remembered result.
      const previous = action.tool === 'run_tests' ? undefined : sinceChange.get(signature)
      if (previous !== undefined) {
        // Nothing changed since this exact action ran, so it would return the same result (stuck-loop detection
        // as in OpenHands): return that result with the instruction to choose a different step.
        if (++repeats >= REPEAT_LIMIT) return { ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot() }
        lastReceipt = JSON.stringify({ ok: false, error: 'builder_v2_repeated_action',
          message: 'This exact action already ran and no file has changed since; its result is below. Choose a different next step.',
          previous: JSON.parse(previous) }).slice(0, 20_000)
        continue
      }
      const receipt = await this.dispatcher.dispatch(options.workspaceId, action,
        action.tool === 'write_file' ? { seenContent: seen.get(action.path) } : {})
      steps.push(receipt)
      if (receipt.changed && action.tool === 'write_file' && !knownFiles.includes(action.path)) knownFiles.push(action.path)
      if (receipt.changed) revision++
      if (action.tool === 'run_tests') verifiedRevision = receipt.ok ? revision : -1
      lastReceipt = JSON.stringify(receipt).slice(0, 20_000)
      const output = receipt.output as { content?: unknown; currentContent?: unknown } | undefined
      if (action.tool === 'read_file' && receipt.ok && typeof output?.content === 'string') seen.set(action.path, output.content)
      if (action.tool === 'write_file' && typeof output?.currentContent === 'string') seen.set(action.path, output.currentContent)
      if (action.tool === 'write_file' && receipt.changed) seen.set(action.path, action.content)
      if (action.tool === 'edit_file' && receipt.changed) seen.delete(action.path)
      if (receipt.changed) { sinceChange.clear(); repeats = 0 } else if (action.tool !== 'run_tests') sinceChange.set(signature, lastReceipt)
      if (receipt.changed || action.tool === 'run_tests' && receipt.ok) unproductive = 0
      else unproductive++
      if (options.onCheckpoint) {
        const checkpoint = await snapshot()
        if (checkpoint) await options.onCheckpoint(checkpoint)
      }
      // A stall pauses with its checkpoint for the bounded continuation controller (#4590): the next slice
      // resumes with fresh repeat tracking, and the job's slice cap bounds how often that happens.
      if (unproductive >= BUILDER_V2_STALL_LIMIT) return { ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot() }
    }
    if (steps.length >= BUILDER_V2_MAX_RECEIPTS) return { ok: false, reason: 'builder_v2_step_budget_exhausted', steps, checkpoint: await snapshot() }
    return { ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot() }
  }
}
