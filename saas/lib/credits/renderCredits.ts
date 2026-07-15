// saas/lib/credits/renderCredits.ts
// Server-side render-credit wallet. The collect-before-spend gate that protects
// the platform from calling a paid provider before the user has prepaid.
//
// Model: prepaid credits, 1 credit = 1 US cent of PROVIDER cost * markup.
// User is charged ceil(providerCostCents * MARKUP). We never call the provider
// until deduct_render_credits succeeds. On provider failure we refund.
//
// Single operator tenant; all access via the service-role admin client.

import { getAdminSupabase } from '@/utils/supabase/server'

export { RENDER_MARKUP, DAILY_PROVIDER_CAP_CENTS, creditsForProviderCost } from './renderPricing'
import { DAILY_PROVIDER_CAP_CENTS, creditsForProviderCost } from './renderPricing'

export async function getRenderBalance(userId: string): Promise<number> {
  const admin = getAdminSupabase()
  const { data } = await admin.from('subscriptions').select('render_credits').eq('user_id', userId).single()
  return Number(data?.render_credits) || 0
}

// How much provider cost this user has already incurred today (for the daily cap).
async function providerSpentTodayCents(userId: string): Promise<number> {
  const admin = getAdminSupabase()
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { data } = await admin
    .from('render_usage_ledger')
    .select('provider_cost_cents,status')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
  if (!Array.isArray(data)) return 0
  return data
    .filter((r) => r.status === 'charged')
    .reduce((sum, r) => sum + (Number(r.provider_cost_cents) || 0), 0)
}

export type ChargeResult =
  | { ok: true; ledgerId: string; creditsCharged: number; newBalance: number }
  | { ok: false; code: 'insufficient_credits' | 'daily_cap' | 'error'; message: string; balance?: number; needed?: number }

// Call BEFORE the provider render. Atomically reserves credits; only returns ok
// when the user has genuinely paid enough AND is under the daily provider cap.
export async function chargeForRender(args: {
  userId: string
  provider: string
  providerCostCents: number
  action?: string
  reference?: string
}): Promise<ChargeResult> {
  const admin = getAdminSupabase()
  const needed = creditsForProviderCost(args.providerCostCents)

  // Daily provider-spend cap (blast-radius protection).
  const spentToday = await providerSpentTodayCents(args.userId)
  if (spentToday + Math.ceil(args.providerCostCents) > DAILY_PROVIDER_CAP_CENTS) {
    return { ok: false, code: 'daily_cap', message: 'Daily render limit reached. Please try again tomorrow.' }
  }

  // Atomic deduct — the DB refuses to go negative, so overspend is impossible.
  const { data, error } = await admin.rpc('deduct_render_credits', {
    target_user_id: args.userId,
    spend_amount: needed,
  })
  if (error) return { ok: false, code: 'error', message: 'Could not reserve credits.' }
  const newBalance = Number(data)
  if (newBalance < 0) {
    const balance = await getRenderBalance(args.userId)
    return { ok: false, code: 'insufficient_credits', message: 'Not enough render credits. Please top up to continue.', balance, needed }
  }

  const { data: row } = await admin
    .from('render_usage_ledger')
    .insert({
      user_id: args.userId,
      provider: args.provider,
      action: args.action || 'render',
      credits_charged: needed,
      provider_cost_cents: Math.ceil(args.providerCostCents),
      status: 'charged',
      reference: args.reference || '',
    })
    .select('id')
    .single()

  return { ok: true, ledgerId: row?.id || '', creditsCharged: needed, newBalance }
}

// Call when the provider render fails AFTER a successful charge. Restores credits
// and marks the ledger row refunded so the daily cap and margin stay accurate.
export async function refundRender(userId: string, ledgerId: string): Promise<void> {
  const admin = getAdminSupabase()
  const { data: row } = await admin
    .from('render_usage_ledger')
    .select('credits_charged,status')
    .eq('id', ledgerId)
    .eq('user_id', userId)
    .single()
  if (!row || row.status !== 'charged') return

  await admin.rpc('increment_render_credits', { target_user_id: userId, add_amount: Number(row.credits_charged) || 0 })
  await admin.from('render_usage_ledger').update({ status: 'refunded' }).eq('id', ledgerId)
}
