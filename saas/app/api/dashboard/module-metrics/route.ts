// saas/app/api/dashboard/module-metrics/route.ts
//
// Real metrics for the dashboard module-overview cards. Each metric is computed
// independently and scoped to the signed-in user. Any metric whose query fails
// (e.g. a table/column not present in a given deployment) returns null, and the
// UI shows "—" rather than a fabricated value. Nothing here is hard-coded.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

async function getAuthedUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  )
  const { data: { user } } = await sb.auth.getUser()
  return user
}

// Run a metric query; on any failure return null so the UI shows "—".
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

export async function GET() {
  const user = await getAuthedUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const a = admin()
  const uid = user.id
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayISO = startOfToday.toISOString()
  const nowISO = new Date().toISOString()

  const [promote, reviews, calendar, spreadsheets, outreach, assistant] = await Promise.all([
    // Promote → number of marketing campaigns (scope: user_id, confirmed).
    safe(async () => {
      const { count, error } = await a
        .from('marketing_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
      if (error) throw error
      return count ?? 0
    }),

    // Reviews → average rating of approved reviews (scope: owner_id, confirmed).
    safe(async () => {
      const { data, error } = await a
        .from('reviews')
        .select('rating')
        .eq('owner_id', uid)
        .eq('approved', true)
      if (error) throw error
      if (!data || data.length === 0) return null
      const avg = data.reduce((sum, r: { rating: number | null }) => sum + (Number(r.rating) || 0), 0) / data.length
      return Math.round(avg * 10) / 10
    }),

    // Calendar → upcoming events from today onward (scope: user_id, confirmed).
    safe(async () => {
      const { count, error } = await a
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .gte('event_date', todayISO)
      if (error) throw error
      return count ?? 0
    }),

    // Spreadsheets → connected data sources ("shared sheets"). Best-effort scope.
    safe(async () => {
      const { count, error } = await a
        .from('sources')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
      if (error) throw error
      return count ?? 0
    }),

    // Outreach → success rate: replied/completed/success over total. Best-effort scope.
    safe(async () => {
      const { data, error } = await a
        .from('outreach_queue')
        .select('status')
        .eq('user_id', uid)
      if (error) throw error
      if (!data || data.length === 0) return null
      const wins = data.filter((r: { status: string | null }) =>
        ['replied', 'completed', 'success'].includes(String(r.status || '')),
      ).length
      return Math.round((wins / data.length) * 100)
    }),

    // Assistant → tasks logged today (scope: user_id, best-effort).
    safe(async () => {
      const { count, error } = await a
        .from('ai_task_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .gte('created_at', todayISO)
      if (error) throw error
      return count ?? 0
    }),
  ])

  return NextResponse.json({
    promote: promote == null ? null : String(promote),
    reviews: reviews == null ? null : String(reviews),
    calendar: calendar == null ? null : String(calendar),
    spreadsheets: spreadsheets == null ? null : String(spreadsheets),
    outreach: outreach == null ? null : `${outreach}%`,
    assistant: assistant == null ? null : String(assistant),
    _generatedAt: nowISO,
  })
}
