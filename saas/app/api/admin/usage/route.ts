import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const PLAN_PRICES: Record<string, number> = {
  free: 0, demo: 0,
  launch: 29, starter: 29,
  growth: 99, pro: 99, paid: 99,
  command: 249,
}

function normalizePlan(plan: string | null | undefined): string {
  const p = String(plan || 'free').toLowerCase()
  if (p === 'demo') return 'free'
  if (p === 'starter') return 'launch'
  if (p === 'pro' || p === 'paid') return 'growth'
  return PLAN_PRICES[p] !== undefined ? p : 'free'
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

    const owners = (process.env.OWNER_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    const admins = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    const email = user.email.toLowerCase()
    if (!owners.includes(email) && !admins.includes(email)) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

    const { data: subs, error: subsError } = await admin
      .from('subscriptions')
      .select('user_id, plan, status, video_credits, image_credits, ai_credits, credits_reset_at')
    if (subsError) return NextResponse.json({ ok: false, error: subsError.message }, { status: 500 })

    const emailMap: Record<string, { email: string; created_at: string; last_sign_in_at: string | null }> = {}
    let page = 1
    while (page <= 20) {
      const { data: usersPage, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (usersError || !usersPage?.users?.length) break
      for (const u of usersPage.users) {
        emailMap[u.id] = { email: u.email || '(no email)', created_at: u.created_at, last_sign_in_at: u.last_sign_in_at || null }
      }
      if (usersPage.users.length < 200) break
      page++
    }

    const users = (subs || []).map(s => {
      const plan = normalizePlan(s.plan)
      const info = emailMap[s.user_id]
      return {
        email: info?.email || s.user_id,
        plan,
        rawPlan: String(s.plan || 'free').toLowerCase(),
        status: s.status || null,
        videoCredits: s.video_credits ?? null,
        imageCredits: s.image_credits ?? null,
        aiCredits: s.ai_credits ?? null,
        creditsResetAt: s.credits_reset_at || null,
        signedUpAt: info?.created_at || null,
        lastSignInAt: info?.last_sign_in_at || null,
      }
    }).sort((a, b) => (PLAN_PRICES[b.plan] || 0) - (PLAN_PRICES[a.plan] || 0))

    const planCounts: Record<string, number> = { free: 0, launch: 0, growth: 0, command: 0 }
    let mrr = 0
    for (const u of users) {
      planCounts[u.plan] = (planCounts[u.plan] || 0) + 1
      mrr += PLAN_PRICES[u.plan] || 0
    }

    const totalAuthUsers = Object.keys(emailMap).length

    return NextResponse.json({ ok: true, data: { users, planCounts, mrr, totalSubscriptions: users.length, totalAuthUsers } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
