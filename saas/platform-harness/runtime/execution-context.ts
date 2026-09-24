// saas/platform-harness/runtime/execution-context.ts
//
// Binds an already-resolved HarnessRun to downstream model/provider/tool adapters.
// This context carries no authority. It only propagates the run's absolute deadline
// and cancellation signal so nested work cannot silently outlive the HarnessRun.

import { AsyncLocalStorage } from 'node:async_hooks'
import type { HarnessManifest } from '../core/types.ts'

export type HarnessExecutionContext = Readonly<{
  manifest: HarnessManifest
  signal: AbortSignal
}>

const harnessExecutionScope = new AsyncLocalStorage<HarnessExecutionContext>()

function deadlineMs(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function currentHarnessExecutionContext(): HarnessExecutionContext | null {
  return harnessExecutionScope.getStore() ?? null
}

export function harnessDeadlineRemainingMs(now = Date.now()): number | null {
  const context = harnessExecutionScope.getStore()
  const deadline = deadlineMs(context?.manifest.deadlineAt)
  return deadline === null ? null : Math.max(0, deadline - now)
}

export function withHarnessExecutionContext<T>(
  manifest: HarnessManifest,
  signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  const existing = harnessExecutionScope.getStore()
  if (existing) {
    if (existing.manifest.runId !== manifest.runId) {
      throw new Error('harness_nested_execution_context_forbidden')
    }
    return operation()
  }
  return harnessExecutionScope.run(Object.freeze({ manifest, signal }), operation)
}
