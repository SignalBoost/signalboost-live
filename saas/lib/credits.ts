import { createClient } from '@supabase/supabase-js'

// Per-plan credit allowances, by meter.
// Public plan names:
// - free     = Free Demo, one-time credits only
// - starter  = Launch
// - pro      = Growth
// - business = Command
//
// Important:
// Free/demo credits DO NOT reset monthly.
// Paid plan credits reset monthly.

export type CreditType = 'video' | 'image' | 'ai'

// Video kept for backwards compatibility (existing callers import this).
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

export const PLAN_IMAGE_CREDITS: Record<string, number> = {
  free: 5,
  demo: 5,
  starter: 50,
  launch: 50,
  pro: 200,
  growth: 200,
  business: 600,
  command: 600,
}

export const PLAN_AI_CREDITS: Record<string, number> = {
  free: 20,
  demo: 20,
  starter: 500,
  launch: 500,
  pro: 2000,
  growth: 2000,
  business: 10000,
  command: 10000,
}

// Maps a meter to its DB column and its per-plan allowance table.
const METERS: Record<CreditType, { column: string; allowances: Record<string, number> }> = {
  video: { column: 'video_credits', allowances: PLAN_VIDEO_CREDITS },
  image: { column: 'image_credits', allowances: PLAN_IMAGE_CREDITS },
  ai:    { column: 'ai_credits',    allowances: PLAN_AI_CREDITS },
}

// Sentinel value returned for owner/admin — high enough to never block.
const UNLIMITED = 999999

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

export function isPrivilegedCreditEmail(emailValue: string | null | undefined): boolean {
  const email = String(emailValue || '').trim().toLowerCase()
  if (!email) return false
  return (
    envList('OWNER_EMAILS').includes(email) ||
    envList('ADMIN_EMAILS').includes(email)
  )
}

// ── Owner/admin bypass ────────────────────────────────────────────────────────
// Looks up the user's email from Supabase auth and checks against
// OWNER_EMAILS and ADMIN_EMAILS env vars. Returns true for privileged users
// so credit checks are skipped entirely.

async function isPrivilegedUser(userId: string): Promise<boolean> {
  try {
    const supabase = adminClient()
    const { data, error } = await supabase.auth.admin.getUserById(userId)
    if (error || !data?.user?.email) return false
    return isPrivilegedCreditEmail(data.user.email)
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function monthElapsed(resetAt: string | null): boolean {
  if (!resetAt) return true
  const last = new Date(resetAt).getTime()
  if (Number.isNaN(last)) return true
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  return Date.now() - last >= THIRTY_DAYS
}

function isFreeDemoPlan(plan: string | null | undefined) {
  return !plan || plan === 'free' || plan === 'demo'
}

function allowanceFor(meter: CreditType, plan: string | null | undefined) {
  const safePlan = plan || 'free'
  const table = METERS[meter].allowances
  return table[safePlan] ?? table.free
}

type CreditState = {
  plan: string
  credits: number      // video — kept for backwards compatibility
  allowance: number    // video allowance — kept for backwards compatibility
  video: number
  image: number
  ai: number
  allowances: { video: number; image: number; ai: number }
}

type CreditStateLookupOptions = {
  // When a caller has already verified the Supabase user in the current request,
  // pass that email so credit privilege can be resolved without another
  // service-role auth.admin.getUserById() network round trip.
  verifiedEmail?: string | null
  // Internal callers that have already run isPrivilegedUser() can skip the
  // second identical privilege lookup when they continue into state loading.
  privilegeChecked?: boolean
}

function unlimitedState(): CreditState {
  return {
    plan:      'command',
    credits:   UNLIMITED,
    allowance: UNLIMITED,
    video:     UNLIMITED,
    image:     UNLIMITED,
    ai:        UNLIMITED,
    allowances: { video: UNLIMITED, image: UNLIMITED, ai: UNLIMITED },
  }
}

/*
  Reads the user's subscription and returns current credit state for ALL meters.

  Owner/admin: always returns unlimited credits — no DB decrement ever happens.

  Free/demo:
  - One-time credits, do NOT reset monthly.

  Paid plans:
  - Launch/Growth/Command credits reset monthly (all meters together).
*/
export async function getCreditState(
  userId: string,
  options: CreditStateLookupOptions = {},
): Promise<CreditState> {
  if (options.verifiedEmail !== undefined) {
    const verifiedEmail = String(options.verifiedEmail || '').trim()
    if (verifiedEmail) {
      if (isPrivilegedCreditEmail(verifiedEmail)) return unlimitedState()
    } else if (!options.privilegeChecked && await isPrivilegedUser(userId)) {
      return unlimitedState()
    }
  } else if (!options.privilegeChecked && await isPrivilegedUser(userId)) {
    return unlimitedState()
  }

  const supabase = adminClient()

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, video_credits, image_credits, ai_credits, credits_reset_at, credits_initialized')
    .eq('user_id', userId)
    .maybeSingle()

  const buildState = (plan: string, video: number, image: number, ai: number): CreditState => ({
    plan,
    credits:  video,
    allowance: allowanceFor('video', plan),
    video,
    image,
    ai,
    allowances: {
      video: allowanceFor('video', plan),
      image: allowanceFor('image', plan),
      ai:    allowanceFor('ai', plan),
    },
  })

  if (error || !data) {
    const plan = 'free'
    const v = allowanceFor('video', plan)
    const i = allowanceFor('image', plan)
    const a = allowanceFor('ai', plan)

    await supabase.from('subscriptions').upsert({
      user_id: userId,
      plan,
      video_credits: v,
      image_credits: i,
      ai_credits: a,
      credits_reset_at: new Date().toISOString(),
      credits_initialized: true,
    }, { onConflict: 'user_id' })

    return buildState(plan, v, i, a)
  }

  const plan = data.plan || 'free'

  const freshV = allowanceFor('video', plan)
  const freshI = allowanceFor('image', plan)
  const freshA = allowanceFor('ai', plan)

  const curV = data.video_credits ?? 0
  const curI = data.image_credits
  const curA = data.ai_credits

  // First-time initialization of the whole credit system.
  if (!data.credits_initialized) {
    await supabase
      .from('subscriptions')
      .update({
        video_credits: freshV,
        image_credits: freshI,
        ai_credits: freshA,
        credits_reset_at: new Date().toISOString(),
        credits_initialized: true,
      })
      .eq('user_id', userId)

    return buildState(plan, freshV, freshI, freshA)
  }

  // Backfill: existing initialized rows that predate the image/ai columns.
  if (curI === null || curA === null) {
    const seededI = curI === null ? freshI : curI
    const seededA = curA === null ? freshA : curA

    await supabase
      .from('subscriptions')
      .update({ image_credits: seededI, ai_credits: seededA })
      .eq('user_id', userId)

    if (isFreeDemoPlan(plan)) {
      return buildState(plan, curV, seededI, seededA)
    }

    if (monthElapsed(data.credits_reset_at)) {
      await supabase
        .from('subscriptions')
        .update({
          video_credits: freshV,
          image_credits: freshI,
          ai_credits: freshA,
          credits_reset_at: new Date().toISOString(),
        })
        .eq('user_id', userId)

      return buildState(plan, freshV, freshI, freshA)
    }

    return buildState(plan, curV, seededI, seededA)
  }

  // Free/demo credits are one-time evaluation credits — never reset.
  if (isFreeDemoPlan(plan)) {
    return buildState(plan, curV, curI, curA)
  }

  // Paid plans reset all meters monthly.
  if (monthElapsed(data.credits_reset_at)) {
    await supabase
      .from('subscriptions')
      .update({
        video_credits: freshV,
        image_credits: freshI,
        ai_credits: freshA,
        credits_reset_at: new Date().toISOString(),
        credits_initialized: true,
      })
      .eq('user_id', userId)

    return buildState(plan, freshV, freshI, freshA)
  }

  return buildState(plan, curV, curI, curA)
}

// ── Video (backwards-compatible original API — unchanged behavior) ─────────────

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
  return spendCredit(userId, 'video')
}

export async function refundVideoCredit(userId: string): Promise<void> {
  return refundCredit(userId, 'video')
}

// ── Generic multi-meter API (video / image / ai) ───────────────────────────────

export async function spendCredit(userId: string, type: CreditType): Promise<{
  ok: boolean
  remaining: number
  plan: string
  reason?: string
}> {
  // Owner/admin bypass — always approve, never decrement
  if (await isPrivilegedUser(userId)) {
    return { ok: true, remaining: UNLIMITED, plan: 'command' }
  }

  const supabase = adminClient()
  const state = await getCreditState(userId, { privilegeChecked: true })
  const current = state[type]

  if (current <= 0) {
    return { ok: false, remaining: 0, plan: state.plan, reason: 'no_credits' }
  }

  const remaining = current - 1
  const column = METERS[type].column

  const { error } = await supabase
    .from('subscriptions')
    .update({ [column]: remaining })
    .eq('user_id', userId)

  if (error) {
    return { ok: false, remaining: current, plan: state.plan, reason: 'db_error' }
  }

  return { ok: true, remaining, plan: state.plan }
}

export async function refundCredit(userId: string, type: CreditType): Promise<void> {
  // Owner/admin bypass — nothing to refund
  if (await isPrivilegedUser(userId)) return

  const supabase = adminClient()
  const column = METERS[type].column

  const { data } = await supabase
    .from('subscriptions')
    .select(`plan, ${column}`)
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return

  const plan      = (data as any).plan || 'free'
  const allowance = allowanceFor(type, plan)
  const current   = (data as any)[column] ?? 0
  const refunded  = Math.min(current + 1, allowance)

  await supabase
    .from('subscriptions')
    .update({ [column]: refunded })
    .eq('user_id', userId)
}