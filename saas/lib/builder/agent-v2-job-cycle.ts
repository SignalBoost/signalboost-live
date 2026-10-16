import { BuilderV2Agent, type BuilderV2Checkpoint, type BuilderV2Outcome } from './agent-v2.ts'
import type { BuilderV2Receipt } from './agent-v2-dispatcher.ts'

/**
 * Durable V2 continuation boundary. The store must atomically fence writes using
 * jobId + claimGeneration; old claims cannot overwrite a newer checkpoint.
 * Existing V1 jobs must never be passed to this adapter.
 */
export interface BuilderV2LeaseStore {
  load(jobId: string): Promise<Readonly<{
    workspaceId: string
    objective: string
    claimGeneration: number
    checkpoint: BuilderV2Checkpoint | null
  }> | null>
  save(jobId: string, claimGeneration: number, checkpoint: BuilderV2Checkpoint): Promise<boolean>
}

export type BuilderV2JobCycle = Readonly<{
  status: 'paused' | 'verified' | 'failed' | 'lost_lease'
  result?: BuilderV2Outcome
  reason: string
}>

/** Commands whose latest run after the last file change passed. */
function passedOnCurrentRevision(steps: readonly BuilderV2Receipt[]): Set<string> {
  const passed = new Set<string>()
  for (const receipt of steps.slice(steps.findLastIndex(step => step.changed) + 1)) {
    if (receipt.tool !== 'run_tests') continue
    const command = String((receipt.output as { requestedCommand?: unknown } | undefined)?.requestedCommand ?? '')
    if (receipt.ok) passed.add(command)
    else passed.delete(command)
  }
  return passed
}

export async function runBuilderV2JobCycle(input: {
  jobId: string
  claimGeneration: number
  store: BuilderV2LeaseStore
  agent: BuilderV2Agent
  maxSteps?: number
  signal?: AbortSignal
}): Promise<BuilderV2JobCycle> {
  const job = await input.store.load(input.jobId)
  if (!job || job.claimGeneration !== input.claimGeneration) return {
    status: 'lost_lease', reason: 'builder_v2_claim_stale',
  }
  let leaseLost = false
  let persisted = job.checkpoint
  const result = await input.agent.run({
    workspaceId: job.workspaceId, objective: job.objective,
    checkpoint: job.checkpoint ?? undefined, maxSteps: input.maxSteps,
    signal: input.signal,
    onCheckpoint: async checkpoint => {
      if (!await input.store.save(input.jobId, input.claimGeneration, checkpoint)) {
        leaseLost = true
        throw new Error('builder_v2_claim_stale')
      }
      persisted = checkpoint
    },
  }).catch((error: unknown): BuilderV2Outcome => ({
    ok: false, reason: error instanceof Error ? error.message : 'builder_v2_unknown_failure', steps: [],
  }))
  if (leaseLost || result.reason === 'builder_v2_claim_stale') return {
    status: 'lost_lease', result, reason: 'builder_v2_claim_stale',
  }
  if (result.ok) return { status: 'verified', result, reason: 'verified' }
  // A model failure pauses only after the slice made progress, the rule V1 continuations use. A slice
  // without progress fails with the model's error: production 2026-10-16, an always-refused
  // model paused every slice instantly and spent all 24 slices with only package.json written.
  // Progress means the slice changed a file, or a command passed on the current revision that had not passed on it
  // before (a newly verified revision, or another required command). Reads, lists, failed edits and a rerun of an
  // already-passing command add nothing (Codex reviews on #4595, #4597, #4598), so a slice of only those followed by
  // a model failure does not earn another slice.
  const before = job.checkpoint
  const after = result.checkpoint
  const passedBefore = passedOnCurrentRevision(before?.steps ?? [])
  const madeProgress = Boolean(after) && (after!.revision > (before?.revision ?? 0)
    || [...passedOnCurrentRevision(after!.steps)].some(command => !passedBefore.has(command)))
  if (result.reason === 'builder_v2_model_unavailable' && !madeProgress) {
    return { status: 'failed', result, reason: `builder_v2_model_unavailable: ${result.summary || 'builder_v2_model_error'}` }
  }
  // Slice budget, cancellation (slice deadline) and a model timeout/outage after progress all pause with the
  // checkpoint; the job's slice cap still bounds how often it resumes.
  if (result.reason === 'builder_v2_step_budget' || result.reason === 'builder_v2_cancelled' || result.reason === 'builder_v2_model_unavailable') {
    if (result.checkpoint && result.checkpoint !== persisted
      && !await input.store.save(input.jobId, input.claimGeneration, result.checkpoint)) {
      return { status: 'lost_lease', result, reason: 'builder_v2_claim_stale' }
    }
    return { status: 'paused', result, reason: result.reason }
  }
  return { status: 'failed', result, reason: result.reason }
}
