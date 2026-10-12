// saas/lib/lab/openRouterPriceSyncLease.ts
// Server only. One OpenRouter price sync at a time across every instance and caller (the hourly job and the teacher
// model list), through the same cross-instance provider lease COS learning uses. After a successful sync the lease
// cools down for an hour, after a failure for five minutes; a caller that cannot claim it skips (prices are fresh or a
// sync is already running), so concurrent syncs can never race on the one-open-price-per-model index.
import { randomUUID } from 'node:crypto'
import { getAdminSupabase } from '@/utils/supabase/server'
import { createSupabaseLearningSourceProviderLeasePort } from '@/lib/cos-core/layers/learning/providerLease'
import { syncOpenRouterTeacherPrices, type SyncOutcome } from '@/lib/lab/openRouterTeacherPrices'

const PRICE_LEASE = 'lab_openrouter_prices'
export const PRICE_SYNC_COOLDOWN_SECONDS = Object.freeze({ ok: 3600, error: 300 })

export async function syncOpenRouterPricesWithLease(payload: unknown, holder: string): Promise<SyncOutcome | { skipped: true }> {
  const port = createSupabaseLearningSourceProviderLeasePort()
  const leaseId = randomUUID()
  if (!(await port.claim({ providerId: PRICE_LEASE, leaseId, holder, ttlSeconds: 30 }))) return { skipped: true }
  let outcome: SyncOutcome = { ok: false, priced: 0, error: 'lab_price_sync_failed' }
  try {
    const admin = getAdminSupabase()
    outcome = await syncOpenRouterTeacherPrices(payload, (fn, args) => admin.rpc(fn, args))
    return outcome
  } finally {
    await port.release({
      providerId: PRICE_LEASE, leaseId, outcome: outcome.ok ? 'ok' : 'error',
      cooldownSeconds: outcome.ok ? PRICE_SYNC_COOLDOWN_SECONDS.ok : PRICE_SYNC_COOLDOWN_SECONDS.error, error: outcome.ok ? null : outcome.error ?? null,
    }).catch(() => undefined)
  }
}
