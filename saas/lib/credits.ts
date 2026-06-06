import { createClient } from '@supabase/supabase-js'

// Per-plan video credit allowance.
// Public plan names:
// - free    = Free Demo, one-time credits only
// - starter = Launch
// - pro     = Growth
// - business = Command
//
// Important:
// Free/demo credits DO NOT reset monthly.
// Paid plan credits reset monthly.
export const PLAN_VIDEO_CREDITS: Record<string, number> = {
  free: 2,
  demo: 2,

  starter: 25,
  launch: 25,

  pro: 100,
  growth: 100,

  business: 300,
  command: 300,
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function monthElapsed(resetAt: string | null): boolean {
  if (!resetAt) return true

  const last = new Date(resetAt).getTime()

  if (Number.isNaN(last)) return true

  const now = Date.now()
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000

  return now - last >= THIRTY_DAYS
}

function isFreeDemoPlan(plan: string | null | undefined) {
  return !plan || plan === 'free' || plan === 'demo'
}

function allowanceForPlan(plan: string | null | undefined) {
  const safePlan = plan || 'free'
  return PLAN_VIDEO_CREDITS[safePlan] ?? PLAN_VIDEO_CREDITS.free
}

type CreditState = {
  plan: string
  credits: number
  allowance: number
}

/*
  Reads the user's subscription and returns current credit state.

  Free/demo:
  - Gets 2 one-time credits.
  - Does NOT reset monthly.
  - Designed for evaluation only.

  Paid plans:
  - Launch/Growth/Command credits reset monthly.
*/
export async function getCreditState(userId: string): Promise<CreditState> {
  const supabase = adminClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, video_credits, credits_reset_at, credits_initialized')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) {
    const allowance = PLAN_VIDEO_CREDITS.free

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
  const allowance = allowanceForPlan(plan)
  const currentCredits = data.video_credits ?? 0

  if (!data.credits_initialized) {
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

  // Free/demo credits are one-time evaluation credits.
  // They should not reset every month.
  if (isFreeDemoPlan(plan)) {
    return { plan, credits: currentCredits, allowance }
  }

  // Paid plans reset monthly.
  if (monthElapsed(data.credits_reset_at)) {
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

  return { plan, credits: currentCredits, allowance }
}

export async function getCredits(userId: string): Promise<number> {
  const state = await getCreditState(userId)

  return state.credits
}

export async function spendVideoCredit(userId: string): Promise<{
  ok: boolean
  remaining: number
  plan: string
  reason?: string
}> {
  const supabase = adminClient()
  const state = await getCreditState(userId)

  if (state.credits <= 0) {
    return {
      ok: false,
      remaining: 0,
      plan: state.plan,
      reason: 'no_credits',
    }
  }

  const remaining = state.credits - 1

  const { error } = await supabase
    .from('subscriptions')
    .update({ video_credits: remaining })
    .eq('user_id', userId)

  if (error) {
    return {
      ok: false,
      remaining: state.credits,
      plan: state.plan,
      reason: 'db_error',
    }
  }

  return {
    ok: true,
    remaining,
    plan: state.plan,
  }
}

export async function refundVideoCredit(userId: string): Promise<void> {
  const supabase = adminClient()

  const { data } = await supabase
    .from('subscriptions')
    .select('plan, video_credits')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return

  const plan = data.plan || 'free'
  const allowance = allowanceForPlan(plan)
  const current = data.video_credits ?? 0
  const refunded = Math.min(current + 1, allowance)

  await supabase
    .from('subscriptions')
    .update({ video_credits: refunded })
    .eq('user_id', userId)
}
