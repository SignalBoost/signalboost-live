import { BuilderV2Agent, type BuilderV2Checkpoint, type BuilderV2Outcome } from './agent-v2.ts'

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
  // Progress means a file changed or a command passed in this slice; reads, lists and failed edits do not count
  // (Codex review on #4595), or a read-then-refused pattern would still spend every slice.
  const newReceipts = (result.checkpoint?.steps ?? []).slice(job.checkpoint?.steps.length ?? 0)
  const madeProgress = newReceipts.some(receipt => receipt.changed || (receipt.tool === 'run_tests' && receipt.ok))
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
