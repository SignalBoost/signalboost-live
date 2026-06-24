// saas/app/api/admin/section-intel/route.ts
//
// Real, computed operational intelligence for the admin cockpit pages. Replaces
// the previously hardcoded FORECASTS / FINANCIAL_LEDGER / KPI_DASHBOARD /
// COCKPIT_PANELS mock constants with live aggregates from proven Supabase
// tables. Admin-gated. Every helper is null-safe: a missing table/column yields
// null, and the UI shows an honest empty-state — it NEVER fabricates a number.

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

const PAYING_PLANS = ['launch', 'growth', 'command', 'paid', 'pro', 'starter']

async function countRows(a: any, table: string, filter?: (q: any) => any): Promise<number | null> {
  try {
    let q = a.from(table).select('id', { count: 'exact', head: true })
    if (filter) q = filter(q)
    const { count, error } = await q
    if (error) return null
    return count ?? 0
  } catch { return null }
}

async function latest(a: any, table: string, col = 'created_at'): Promise<string | null> {
  try {
    const { data, error } = await a.from(table).select(col).order(col, { ascending: false }).limit(1)
    if (error || !Array.isArray(data) || !data.length || !data[0]?.[col]) return null
    const d = new Date(data[0][col])
    if (isNaN(d.getTime())) return null
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return null }
}

async function supabaseHealth(a: any): Promise<string | null> {
  try {
    const { error } = await a.from('subscriptions').select('id', { count: 'exact', head: true })
    return error ? null : 'Connected'
  } catch { return null }
}

const sinceISO = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString() }

// Recent rows for a section's table, shaped to that section's columns. Only
// sections with a clean, proven source return rows; the rest return [] so the
// UI shows an honest "no records yet" rather than a fabricated row.
async function sectionRows(a: any, section: string): Promise<string[][]> {
  try {
    if (section === 'system') {
      const [health, lastOutreach, lastProspect, errors] = await Promise.all([
        supabaseHealth(a), latest(a, 'outreach_sends'), latest(a, 'prospects'), countRows(a, 'error_logs'),
      ])
      const rows: string[][] = []
      rows.push(['Supabase', health ? 'Connected' : 'Unknown', health ? 'just now' : '—', health ? 'Health probe OK' : 'No response'])
      if (lastOutreach) rows.push(['Outreach engine', 'Active', lastOutreach, 'Last successful send'])
      if (lastProspect) rows.push(['Prospect discovery', 'Active', lastProspect, 'Last successful run'])
      if (errors != null) rows.push(['Error log', errors === 0 ? 'Clean' : 'Attention', '—', `${errors} logged error${errors === 1 ? '' : 's'}`])
      return rows
    }
    if (section === 'revenue') {
      const [free, paid] = await Promise.all([
        countRows(a, 'subscriptions', (q: any) => q.eq('plan', 'free')),
        countRows(a, 'subscriptions', (q: any) => q.in('plan', PAYING_PLANS)),
      ])
      const rows: string[][] = []
      if (free != null) rows.push(['Free', String(free), '—', '—'])
      if (paid != null) rows.push(['Paid', String(paid), '—', '—'])
      return rows
    }
    if (section === 'sales') {
      const [prospects, sends] = await Promise.all([countRows(a, 'prospects'), countRows(a, 'outreach_sends')])
      const rows: string[][] = []
      if (prospects != null) rows.push(['Prospects', String(prospects), '—', '—'])
      if (sends != null) rows.push(['Outreach sent', String(sends), '—', '—'])
      return rows
    }
    return []
  } catch { return [] }
}

export async function GET(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const a = getAdminSupabase()
  const section = new URL(req.url).searchParams.get('section') || ''

  const [
    accounts, paidSubs, freeSubs, prospects, outreachSends, aiTasks, sites, videos, reviews, errors,
    acc7, acc30, acc90, health, lastOutreach, lastProspect, rows,
  ] = await Promise.all([
    countRows(a, 'accounts'),
    countRows(a, 'subscriptions', (q: any) => q.in('plan', PAYING_PLANS)),
    countRows(a, 'subscriptions', (q: any) => q.eq('plan', 'free')),
    countRows(a, 'prospects'),
    countRows(a, 'outreach_sends'),
    countRows(a, 'ai_task_log'),
    countRows(a, 'ai_business_sites'),
    countRows(a, 'video_jobs'),
    countRows(a, 'reviews'),
    countRows(a, 'error_logs'),
    countRows(a, 'accounts', (q: any) => q.gte('created_at', sinceISO(7))),
    countRows(a, 'accounts', (q: any) => q.gte('created_at', sinceISO(30))),
    countRows(a, 'accounts', (q: any) => q.gte('created_at', sinceISO(90))),
    supabaseHealth(a),
    latest(a, 'outreach_sends'),
    latest(a, 'prospects'),
    sectionRows(a, section),
  ])

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      totals: { accounts, paidSubs, freeSubs, prospects, outreachSends, aiTasks, sites, videos, reviews, errors },
      windows: { accounts7: acc7, accounts30: acc30, accounts90: acc90 },
      health: { supabase: health, errors, lastOutreach, lastProspect },
      rows,
    },
    { headers: { 'Cache-Control': 'no-store, private' } },
  )
}
