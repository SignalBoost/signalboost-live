// saas/platform-harness/runtime/execution-context.ts
//
// Binds an already-resolved HarnessRun to downstream model/provider/tool adapters.
// This context carries no authority. It only propagates the run's absolute deadline
// and cancellation signal so nested work cannot silently outlive the HarnessRun.

import { AsyncLocalStorage } from 'node:async_hooks'
import type { HarnessManifest } from '../core/types.ts'

type HarnessProviderCostLedger = {
  maxCostUsd: number
  reservedCostUsd: number
}

export type HarnessExecutionContext = Readonly<{
  manifest: HarnessManifest
  signal: AbortSignal
  /** Present only for lightweight host ingress that explicitly enabled a hard provider-spend ceiling. */
  providerCostLedger?: HarnessProviderCostLedger
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

export function reserveHarnessProviderCostUsd(maxEstimatedCostUsd: number): Readonly<{
  maxCostUsd: number
  reservedCostUsd: number
  remainingCostUsd: number
}> | null {
  const context = harnessExecutionScope.getStore()
  const ledger = context?.providerCostLedger
  if (!ledger) return null
  const reservation = Number(maxEstimatedCostUsd)
  if (!Number.isFinite(reservation) || reservation <= 0) {
    throw new Error('harness_provider_cost_reservation_invalid')
  }
  if (ledger.reservedCostUsd + reservation > ledger.maxCostUsd + Number.EPSILON) {
    throw new Error('harness_provider_cost_budget_exceeded')
  }
  ledger.reservedCostUsd = Number((ledger.reservedCostUsd + reservation).toFixed(6))
  return Object.freeze({
    maxCostUsd: ledger.maxCostUsd,
    reservedCostUsd: ledger.reservedCostUsd,
    remainingCostUsd: Math.max(0, Number((ledger.maxCostUsd - ledger.reservedCostUsd).toFixed(6))),
  })
}

export function withHarnessProviderCostBudget<T>(
  maxCostUsd: number,
  operation: () => Promise<T>,
): Promise<T> {
  const existing = harnessExecutionScope.getStore()
  if (!existing) return operation()
  if (existing.providerCostLedger) return operation()
  const max = Number(maxCostUsd)
  if (!Number.isFinite(max) || max < 0) throw new Error('harness_provider_cost_budget_invalid')
  return harnessExecutionScope.run(Object.freeze({
    ...existing,
    providerCostLedger: { maxCostUsd: max, reservedCostUsd: 0 },
  }), operation)
}

export function withHarnessExecutionContext<T>(
  manifest: HarnessManifest,
  signal: AbortSignal,
  operation: () => Promise<T>,
  options: Readonly<{ enforceProviderCostBudget?: boolean }> = {},
): Promise<T> {
  const existing = harnessExecutionScope.getStore()
  if (existing) {
    if (existing.manifest.runId === manifest.runId) return operation()
    if (
      manifest.parent?.runId !== existing.manifest.runId
      || manifest.parent?.authorityManifestRef !== existing.manifest.authorityManifestRef
    ) {
      throw new Error('harness_nested_execution_context_forbidden')
    }
    const parentDeadline = deadlineMs(existing.manifest.deadlineAt)
    const childDeadline = deadlineMs(manifest.deadlineAt)
    if (parentDeadline !== null && (childDeadline === null || childDeadline > parentDeadline)) {
      throw new Error('harness_nested_deadline_widening_forbidden')
    }
  }
  const configuredMaxCostUsd = Number(manifest.limits.maxCostUsd)
  const providerCostLedger = options.enforceProviderCostBudget === true
    && Number.isFinite(configuredMaxCostUsd)
    && configuredMaxCostUsd >= 0
    ? { maxCostUsd: configuredMaxCostUsd, reservedCostUsd: 0 }
    : undefined
  return harnessExecutionScope.run(Object.freeze({
    manifest,
    signal,
    ...(providerCostLedger ? { providerCostLedger } : {}),
  }), operation)
}
