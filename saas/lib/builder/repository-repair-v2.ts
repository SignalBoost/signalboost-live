// saas/lib/builder/repository-repair-v2.ts
//
// THE REPOSITORY REPAIR LANE ON BUILDER V2. Self-Healing repairs of the SignalBoost repository (audit, site and
// production recovery, owner Platform Engineer tasks) ran on the retired V1 tool loop, which cannot pause: a repair that
// spent its slice's provider budget or time simply failed. Production 2026-10-21..28: 70 builder_turn_timeout,
// 39 harness_provider_cost_budget_exceeded and 23 builder_repeated_inspection_blocked failures, all in this lane, while
// paid calls cost ~$0.02 each and reported their real cost. V2 saves its progress and continues in the next slice.
//
// A repository sandbox does not survive a slice, so a continuation rebuilds it: the same pinned commit, the same files
// made visible to the agent, and every edit the agent made replayed from the workspace copy written at edit time. The
// rebuilt checkout then has the same V2 workspace digest as the one that paused, so the agent's checkpoint resumes.

import type { BuilderV2Checkpoint } from './agent-v2.ts'
import type { BuilderV2Receipt } from './agent-v2-dispatcher.ts'
import type { BuilderV2LeaseStore } from './agent-v2-job-cycle.ts'
import type { BuilderToolTrace, BuilderWorkspacePort } from './contracts.ts'
import type { RepositoryRepairProofState } from './repository-repair-proof-controller.ts'

/** The repository-specific part of a repair checkpoint, stored next to the V2 agent checkpoint. */
export type RepositoryRepairState = Readonly<{
  /** The exact objective the agent works on; its digest binds the checkpoint, so it never changes after slice one. */
  objective: string
  visiblePaths: readonly string[]
  editedPaths: readonly string[]
  /** Null for owner engineering work, which has no failing baseline to prove. */
  proof: RepositoryRepairProofState | null
}>

export type RepositoryRepairCheckpoint = BuilderV2Checkpoint & Readonly<{ repositoryRepair: RepositoryRepairState }>

export function isRepositoryRepairCheckpoint(value: unknown): value is RepositoryRepairCheckpoint {
  if (!value || typeof value !== 'object') return false
  const checkpoint = value as Record<string, unknown>
  const state = checkpoint.repositoryRepair as Record<string, unknown> | undefined
  return checkpoint.version === 2 && Boolean(state) && typeof state!.objective === 'string'
    && Array.isArray(state!.visiblePaths) && Array.isArray(state!.editedPaths)
    && (state!.proof === null || typeof state!.proof === 'object')
}

/**
 * The agent's objective. The host-selected proof is a required execution, so V2 runs it itself after every change and
 * cannot report completion until it passes on the final source.
 */
export function repositoryRepairV2Objective(baseObjective: string, proofCommand: string | null): string {
  const base = String(baseObjective || '').trim()
  if (proofCommand) return `${base}\n\nRequired execution:\n${proofCommand}`
  return `${base}\n\nREPAIR REPRODUCTION CONTRACT: No failing proof was supplied or selected. Do not treat a passing existing test as proof that the reported defect is repaired. First identify the reported behavioral failure, its implicated source and a targeted regression assertion. Inspect the relevant source and test, write a regression test under tests/ if necessary, then RUN that test and record its actual nonzero exit before changing implementation. If an existing test passes, it is merely a diagnostic; continue investigating or add a targeted failing regression instead of terminating. After reproducing the failure, make the smallest source correction and rerun the same regression followed by relevant existing tests. If evidence cannot reproduce the reported behavior within the bounded task, terminate explicitly as unreproduced with the exact blocker and attempted commands; never claim success or invent a mutation.`
}

/** The workspace copy of a repository file the agent edited, written at edit time by the lane. */
export function repositoryEditCopyPath(path: string): string {
  return `repository/${path}`
}

/**
 * Rebuild a fresh checkout to the paused one: make the same files visible and replay every edit from its saved copy.
 * A missing copy means the edit cannot be reproduced, and the checkpoint must not resume on different source.
 */
export async function restoreRepositoryRepairCheckout(input: Readonly<{
  checkout: BuilderWorkspacePort
  copies: Pick<BuilderWorkspacePort, 'readFile'>
  workspaceId: string
  state: RepositoryRepairState
}>): Promise<void> {
  for (const path of input.state.visiblePaths) {
    if (input.state.editedPaths.includes(path)) continue
    await input.checkout.readFile(input.workspaceId, path)
  }
  for (const path of input.state.editedPaths) {
    const copy = await input.copies.readFile(input.workspaceId, repositoryEditCopyPath(path))
    if (!copy) throw new Error('builder_repository_repair_edit_copy_missing')
    await input.checkout.writeFile(input.workspaceId, path, copy.content)
  }
}

/**
 * The V2 lease store for one repair slice. Every checkpoint V2 saves carries the repository state current at that
 * moment, written through the job's claim-fenced persistence.
 */
export function repositoryRepairLeaseStore(input: Readonly<{
  jobId: string
  claimGeneration: number
  workspaceId: string
  objective: string
  checkpoint: BuilderV2Checkpoint | null
  repositoryState: () => RepositoryRepairState
  persist: (checkpoint: RepositoryRepairCheckpoint) => Promise<boolean>
}>): BuilderV2LeaseStore & { lastSaved(): RepositoryRepairCheckpoint | null } {
  let saved: RepositoryRepairCheckpoint | null = null
  return {
    async load(jobId) {
      if (jobId !== input.jobId) return null
      return { workspaceId: input.workspaceId, objective: input.objective, claimGeneration: input.claimGeneration, checkpoint: input.checkpoint }
    },
    async save(jobId, claimGeneration, checkpoint) {
      if (jobId !== input.jobId || claimGeneration !== input.claimGeneration) return false
      const full: RepositoryRepairCheckpoint = { ...checkpoint, repositoryRepair: input.repositoryState() }
      if (!await input.persist(full)) return false
      saved = full
      return true
    },
    lastSaved: () => saved,
  }
}

function receiptPath(receipt: BuilderV2Receipt): string | null {
  const path = (receipt.output as { path?: unknown } | undefined)?.path
  return typeof path === 'string' ? path : null
}

/**
 * V2 receipts in the trace shape the lane's evidence consumers read (lessons, certification, cognitive outcomes,
 * the browser acceptance contract and the public trace). Nothing is added that the receipt does not record.
 */
export function repositoryRepairTraceFromReceipts(steps: readonly BuilderV2Receipt[]): BuilderToolTrace[] {
  return steps.map((receipt, index) => {
    const output = receipt.output as Record<string, unknown> | undefined
    const base = { round: index + 1, ok: receipt.ok, output: receipt.output, ...(receipt.error ? { error: receipt.error } : {}) }
    if (receipt.tool === 'run_tests') {
      const command = String(output?.requestedCommand ?? output?.executedCommand ?? '')
      const testFailure = !receipt.ok && output?.timedOut === false && typeof output?.exitCode === 'number'
      return { ...base, toolId: 'run' as const, input: { command }, ...(testFailure ? { failureClass: 'test' as const } : {}) }
    }
    if (receipt.tool === 'browser_cli') return { ...base, toolId: 'browser_cli' as const, input: { action: output?.action ?? '' } }
    const path = receiptPath(receipt)
    return { ...base, toolId: receipt.tool, input: path ? { path } : {} }
  })
}

export type RepositoryCheckout = BuilderWorkspacePort & Readonly<{ visibleFiles(): readonly string[] }>
