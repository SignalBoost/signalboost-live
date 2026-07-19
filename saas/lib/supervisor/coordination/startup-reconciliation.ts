import type { CoordinationStore, WorkItem } from './index.ts'

export interface ContinuationApprovalInvalidator {
  invalidate(input: {
    executionId: string
    workItemId: string
    reason: 'coordination_lease_expired'
    invalidatedAt: string
  }): Promise<void>
}

export interface SupervisorReconciliationReport {
  startedAt: string
  completedAt: string
  reconciledWorkItemIds: string[]
  invalidatedExecutionIds: string[]
  schemaVersion: 'supervisor-startup-reconciliation-v1'
}

export interface SupervisorReconciliationScheduler {
  readonly ready: Promise<SupervisorReconciliationReport>
  stop(): void
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

async function invalidateAffectedApprovals(
  workItems: readonly WorkItem[],
  invalidator: ContinuationApprovalInvalidator,
  at: Date,
): Promise<string[]> {
  const affectedByExecution = new Map<string, WorkItem & { executionId: string }>()

  for (const item of workItems
    .filter((candidate): candidate is WorkItem & { executionId: string } => Boolean(candidate.executionId))
    .sort((a, b) => a.workItemId.localeCompare(b.workItemId))) {
    if (!affectedByExecution.has(item.executionId)) affectedByExecution.set(item.executionId, item)
  }

  const invalidated: string[] = []
  for (const executionId of uniqueSorted([...affectedByExecution.keys()])) {
    const item = affectedByExecution.get(executionId)
    if (!item) continue
    await invalidator.invalidate({
      executionId,
      workItemId: item.workItemId,
      reason: 'coordination_lease_expired',
      invalidatedAt: at.toISOString(),
    })
    invalidated.push(executionId)
  }
  return invalidated
}

export async function runSupervisorStartupReconciliation(input: {
  store: CoordinationStore
  approvalInvalidator: ContinuationApprovalInvalidator
  now?: Date
}): Promise<SupervisorReconciliationReport> {
  const startedAt = input.now ?? new Date()
  if (!Number.isFinite(startedAt.getTime())) throw new Error('invalid_reconciliation_time')

  const reconciled = await input.store.reconcileExpiredLeases(startedAt)
  const invalidatedExecutionIds = await invalidateAffectedApprovals(
    reconciled,
    input.approvalInvalidator,
    startedAt,
  )

  return {
    startedAt: startedAt.toISOString(),
    completedAt: startedAt.toISOString(),
    reconciledWorkItemIds: uniqueSorted(reconciled.map(item => item.workItemId)),
    invalidatedExecutionIds,
    schemaVersion: 'supervisor-startup-reconciliation-v1',
  }
}

export function scheduleSupervisorReconciliation(input: {
  store: CoordinationStore
  approvalInvalidator: ContinuationApprovalInvalidator
  intervalMs: number
  now?: () => Date
  onReport?: (report: SupervisorReconciliationReport) => void | Promise<void>
  onError?: (error: unknown) => void | Promise<void>
}): SupervisorReconciliationScheduler {
  if (!Number.isSafeInteger(input.intervalMs) || input.intervalMs < 1_000) {
    throw new Error('reconciliation_interval_invalid')
  }

  const clock = input.now ?? (() => new Date())
  let stopped = false
  let running = false

  const run = async (): Promise<SupervisorReconciliationReport> => {
    if (running) throw new Error('reconciliation_already_running')
    running = true
    try {
      const report = await runSupervisorStartupReconciliation({
        store: input.store,
        approvalInvalidator: input.approvalInvalidator,
        now: clock(),
      })
      await input.onReport?.(report)
      return report
    } finally {
      running = false
    }
  }

  const ready = run()
  const timer = setInterval(() => {
    if (stopped || running) return
    void run().catch(error => input.onError?.(error))
  }, input.intervalMs)
  timer.unref?.()

  return {
    ready,
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
