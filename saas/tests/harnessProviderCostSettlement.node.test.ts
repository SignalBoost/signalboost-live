import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  reserveHarnessProviderCostUsd,
  settleHarnessProviderCostUsd,
  withHarnessExecutionContext,
} from '../platform-harness/runtime/execution-context.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'

async function inBudget(operation: () => Promise<void>): Promise<void> {
  const manifest = {
    runId: 'provider-cost-regression',
    limits: { maxCostUsd: 0.24 },
  } as HarnessManifest
  await withHarnessExecutionContext(manifest, new AbortController().signal, operation, {
    enforceProviderCostBudget: true,
  })
}

test('provider settlement releases unused reservation for subsequent calls', async () => {
  await inBudget(async () => {
    reserveHarnessProviderCostUsd(0.08)
    settleHarnessProviderCostUsd(0.08, 0.02)
    reserveHarnessProviderCostUsd(0.20)
    assert.throws(() => reserveHarnessProviderCostUsd(0.03), /harness_provider_cost_budget_exceeded/)
  })
})

test('provider settlement rejects malformed and unreserved charges', async () => {
  await inBudget(async () => {
    reserveHarnessProviderCostUsd(0.08)
    assert.throws(() => settleHarnessProviderCostUsd(0.08, Number.NaN), /harness_provider_cost_settlement_invalid/)
    assert.throws(() => settleHarnessProviderCostUsd(0.09, 0.01), /harness_provider_cost_settlement_exceeds_reserved/)
    settleHarnessProviderCostUsd(0.08, 0.02)
  })
})

test('provider overcharge remains accounted and blocks further reservations', async () => {
  await inBudget(async () => {
    reserveHarnessProviderCostUsd(0.08)
    assert.throws(() => settleHarnessProviderCostUsd(0.08, 0.25), /harness_provider_cost_budget_exceeded/)
    assert.throws(() => reserveHarnessProviderCostUsd(0.01), /harness_provider_cost_budget_exceeded/)
  })
})
