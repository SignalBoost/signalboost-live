// saas/lib/builder/work-budget.ts
//
// How much work a durable Builder job gets. Production 2026-10-14: the OrderFlow build (15 required files, 30+ tests)
// stopped after its 4 work slices with 9 files written and 29/31 tests passing, and the report gave no checklist.
// Every job keeps its first BASE_WORK_SLICES; beyond that, up to MAX_WORK_SLICES, only a slice that made progress earns
// another. The database functions enforce the same ceiling (migration 20261014060000).
import type { BuilderLoopCheckpoint } from './checkpoint.ts'
import type { BuilderJobRecord } from './job-store.ts'
import { builderContractObjective, builderTaskContract } from './task-contract.ts'

export const BASE_WORK_SLICES = 4
export const MAX_WORK_SLICES = 24

const passCount = (item: { toolId?: string; output?: unknown }): number => {
  if (item.toolId !== 'run') return 0
  const stdout = String((item.output as { stdout?: unknown } | undefined)?.stdout || '')
  const match = /(?:^|\n)\s*(?:#|ℹ)\s+pass\s+(\d+)/.exec(stdout)
  return match ? Number(match[1]) : 0
}

/** A slice made progress when it saved a file or raised the best passing-test count. */
export function builderSliceMadeProgress(previous: BuilderLoopCheckpoint | null | undefined, current: BuilderLoopCheckpoint): boolean {
  const before = previous?.trace.length ?? 0
  const earlier = current.trace.slice(0, before)
  const fresh = current.trace.slice(before)
  if (fresh.some(item => item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))) return true
  return Math.max(0, ...fresh.map(passCount)) > Math.max(0, ...earlier.map(passCount))
}

/**
 * Waiting for the model is not work. Production 2026-10-14 (jobs 3df9cd5b, 031432d4, 63cc435e, 50f71674): every pick-up
 * counts as a claim, including the 3 capacity re-queues, so OrderFlow builds spent their free slices waiting for the GPU,
 * then ended a slice still waiting (no file saved) and were judged "no progress" with 8-10 of 15 files written.
 * Free slices count only work slices (claims minus capacity re-queues), and a slice that ended waiting for the model is
 * never a verdict on the job. The total claim ceiling still bounds everything.
 */
export function builderMayContinue(
  job: Pick<BuilderJobRecord, 'claimGeneration' | 'checkpoint' | 'metadata'>,
  checkpoint: BuilderLoopCheckpoint,
  endedWaitingForModel = false,
): boolean {
  if (job.claimGeneration >= MAX_WORK_SLICES) return false
  const capacityRequeues = Number(job.metadata?.builderCapacityDeferrals)
  const workSlices = job.claimGeneration - (Number.isInteger(capacityRequeues) && capacityRequeues > 0 ? capacityRequeues : 0)
  return workSlices < BASE_WORK_SLICES || endedWaitingForModel || builderSliceMadeProgress(job.checkpoint, checkpoint)
}

/** "X of Y required files written" when a build stops at its work limit, so the stop is never a silent dead end. */
export function builderWorkLimitReport(job: Pick<BuilderJobRecord, 'objective' | 'metadata'>, files: readonly string[]): string {
  const required = builderTaskContract(builderContractObjective(job.objective, job.metadata.projectContext)).files
  if (!required.length) return ''
  const missing = required.filter(path => !files.includes(path))
  return `${required.length - missing.length} of ${required.length} required files are written.`
    + (missing.length ? ` Missing: ${missing.join(', ')}.` : '')
    + ' The saved workspace remains available. The platform must resume an eligible checkpoint automatically; if the job is terminal, show the actual blocker and preserve these files rather than asking the customer to resubmit.'
}
