import type { BuilderAiPort, BuilderWorkspacePort } from './contracts.ts'
import { checkpointDigest, workspaceDigest } from './checkpoint.ts'
import { BuilderV2Dispatcher, type BuilderV2Action, type BuilderV2Receipt } from './agent-v2-dispatcher.ts'
import { builderTaskContract } from './task-contract.ts'

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
  if (!Array.isArray(checkpoint.steps) || checkpoint.steps.length > 120) return false
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
  const pendingCommands = contract.commands.filter(command =>
    !passing.some(output => output?.requestedCommand === command || output?.executedCommand === command))
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

function parseDecision(value: string | null): Decision | null {
  if (!value) return null
  let object: unknown
  try { object = JSON.parse(value) } catch { return null }
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
      if (!validateBuilderV2ReceiptHistory(saved) || [saved.revision, saved.verifiedRevision, saved.unproductive].some(n => !Number.isSafeInteger(n) || n < -1 || n > 120)) {
        return { ok: false, reason: 'builder_v2_checkpoint_invalid', steps: [] }
      }
    }
    const steps: BuilderV2Receipt[] = [...(saved?.steps || [])]
    const maxSteps = Math.max(1, Math.min(options.maxSteps ?? 60, 120))
    let revision = saved?.revision ?? 0
    let verifiedRevision = saved?.verifiedRevision ?? -1
    let unproductive = saved?.unproductive ?? 0
    let lastReceipt = saved?.lastReceipt ?? ''
    const snapshot = async (): Promise<BuilderV2Checkpoint | undefined> => this.workspace ? {
      version: 2, workspaceId: options.workspaceId,
      objectiveDigest: checkpointDigest(options.objective),
      workspaceDigest: await workspaceDigest(this.workspace, options.workspaceId),
      steps: [...steps], revision, verifiedRevision, unproductive, lastReceipt,
    } : undefined
    const checklist = builderTaskContract(options.objective)
    let checklistRejections = 0
    for (let i = steps.length; i < maxSteps; i++) {
      if (options.signal?.aborted) return { ok: false, reason: 'builder_v2_cancelled', steps, checkpoint: await snapshot() }
      let raw: string | null
      try {
        raw = await this.ai.generate({
          systemPrompt: 'You are an autonomous software engineering agent. Choose one tool operation at a time. Inspect, write or edit, run tests, diagnose failures and repair. Never claim verification without a real passing run_tests receipt. Output JSON only: {"type":"tool","action":{"tool":"list_files"}} or {"type":"finish","summary":"..."}; tools: list_files, read_file, search_files, write_file, edit_file, run_tests.',
          prompt: JSON.stringify({
            objective: options.objective,
            ...(checklist.files.length || checklist.commands.length || checklist.minimumTests
              ? { checklist: { files: checklist.files, commands: checklist.commands, minimumTests: checklist.minimumTests } } : {}),
            workspaceId: options.workspaceId,
            lastReceipt,
            tail: steps.slice(-8),
            verified: verifiedRevision === revision && verifiedRevision >= 0,
            stepsRemaining: maxSteps - i,
          }),
          maxTokens: 4096,
          signal: options.signal,
        })
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : 'builder_v2_model_error', steps }
      }
      const decision = parseDecision(raw)
      if (!decision) return { ok: false, reason: 'builder_v2_invalid_model_action', steps }
      if (decision.type === 'finish') {
        if (!(verifiedRevision === revision && verifiedRevision >= 0)) return { ok: false, reason: 'builder_v2_unverified_completion', steps }
        const listed = await this.dispatcher.dispatch(options.workspaceId, { tool: 'list_files' })
        const files = Array.isArray(listed.output) ? listed.output.map(file => String((file as { path?: unknown }).path)) : []
        const acceptance = builderV2Acceptance(options.objective, files, steps)
        if (acceptance.satisfied) return { ok: true, reason: 'verified', steps, summary: decision.summary }
        // Not a receipt: the counters rebuilt from receipts on resume stay valid. Bounded so a model that keeps
        // claiming completion ends with the exact unmet checklist instead of looping.
        if (++checklistRejections >= 3) return { ok: false, reason: 'builder_v2_checklist_incomplete', steps, checkpoint: await snapshot() }
        lastReceipt = JSON.stringify({ tool: 'finish', ok: false, error: 'builder_v2_checklist_incomplete', ...acceptance,
          next: acceptance.missingFiles.length ? ['write_file'] : ['run_tests', 'edit_file'] }).slice(0, 20_000)
        continue
      }
      const receipt = await this.dispatcher.dispatch(options.workspaceId, decision.action)
      steps.push(receipt)
      if (receipt.changed) revision++
      if (decision.action.tool === 'run_tests') verifiedRevision = receipt.ok ? revision : -1
      lastReceipt = JSON.stringify(receipt).slice(0, 20_000)
      if (receipt.changed || decision.action.tool === 'run_tests' && receipt.ok) unproductive = 0
      else unproductive++
      if (options.onCheckpoint) {
        const checkpoint = await snapshot()
        if (checkpoint) await options.onCheckpoint(checkpoint)
      }
      if (unproductive >= 6) return { ok: false, reason: 'builder_v2_no_progress', steps, checkpoint: await snapshot() }
    }
    return { ok: false, reason: 'builder_v2_step_budget', steps, checkpoint: await snapshot() }
  }
}
