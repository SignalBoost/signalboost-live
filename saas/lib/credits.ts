import { createClient } from '@supabase/supabase-js'

// Per-plan monthly video credit allowance (matches the pricing page + cost model)
export const PLAN_VIDEO_CREDITS: Record<string, number> = {
  free:     2,
  starter:  10,
  pro:      40,
  business: 120,
}

// Server-side Supabase client using the service role key.
// This NEVER runs in the browser — credits cannot be tampered with by users.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Has it been at least a month since the last reset?
function monthElapsed(resetAt: string | null): boolean {
  if (!resetAt) return true
  const last = new Date(resetAt).getTime()
  if (Number.isNaN(last)) return true
  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  return now - last >= THIRTY_DAYS
}

type CreditState = {
  plan: string
  credits: number
  allowance: number
}

/*
  Reads the user's subscription, applies a monthly reset if due,
  and returns the current credit state. Creates a row if none exists
  (defaults to the free plan). Also grants the initial allowance to any
  row that has never been initialized (credits_initialized = false).
*/
export async function getCreditState(userId: string): Promise<CreditState> {
  const supabase = adminClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, video_credits, credits_reset_at, credits_initialized')
    .eq('user_id', userId)
    .maybeSingle()

  // No subscription row yet — treat as free, create a row with free credits
  if (error || !data) {
    const allowance = PLAN_VIDEO_CREDITS['free']
    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan: 'free',
      video_credits: allowance,
      credits_reset_at: new Date().toISOString(),
      credits_initialized: true,
    }, { onConflict: 'user_id' })
    return { plan: 'free', credits: allowance, allowance }
  }

  const plan = data.plan || 'free'
  const allowance = PLAN_VIDEO_CREDITS[plan] ?? PLAN_VIDEO_CREDITS['free']

  // Never initialized (e.g. row created before credits existed) OR monthly reset due
  // → grant the plan's allowance and mark initialized.
  if (!data.credits_initialized || monthElapsed(data.credits_reset_at)) {
    await supabase
      .from('subscriptions')
      .update({
        video_credits: allowance,
        credits_reset_at: new Date().toISOString(),
        credits_initialized: true,
      })
      .eq('user_id', userId)
    return { plan, credits: allowance, allowance }
  }

  return { plan, credits: data.video_credits ?? 0, allowance }
}

/*
  Convenience helper: returns just the current credit number.
  Used by server-side API routes (never call directly from the browser).
*/
export async function getCredits(userId: string): Promise<number> {
  const state = await getCreditState(userId)
  return state.credits
}

/*
  Attempts to spend ONE video credit. Returns success + remaining balance.
  Applies monthly reset first via getCreditState, so balances are always current.
*/
export async function spendVideoCredit(userId: string): Promise<{
  ok: boolean
  remaining: number
  plan: string
  reason?: string
}> {
  const supabase = adminClient()
  const state = await getCreditState(userId)

  if (state.credits <= 0) {
    return { ok: false, remaining: 0, plan: state.plan, reason: 'no_credits' }
  }

  const remaining = state.credits - 1
  const { error } = await supabase
    .from('subscriptions')
    .update({ video_credits: remaining })
    .eq('user_id', userId)

  if (error) {
    return { ok: false, remaining: state.credits, plan: state.plan, reason: 'db_error' }
  }

  return { ok: true, remaining, plan: state.plan }
}

/*
  Refunds ONE video credit (used when a generation fails after a credit was spent).
  Never exceeds the plan's monthly allowance, so a refund can't inflate a balance.
*/
export async function refundVideoCredit(userId: string): Promise<void> {
  const supabase = adminClient()

  const { data } = await supabase
    .from('subscriptions')
    .select('plan, video_credits')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return

  const plan = data.plan || 'free'
  const allowance = PLAN_VIDEO_CREDITS[plan] ?? PLAN_VIDEO_CREDITS['free']
  const current = data.video_credits ?? 0
  const refunded = Math.min(current + 1, allowance)

  await supabase
    .from('subscriptions')
    .update({ video_credits: refunded })
    .eq('user_id', userId)
}
