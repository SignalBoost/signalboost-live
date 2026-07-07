// saas/app/api/admin/section-intel/route.ts
//
// Real, computed operational intelligence for the admin cockpit pages.
// Admin-gated. Every helper is null-safe: a missing table/column yields null,
// and the UI shows an honest empty-state — it never fabricates hidden activity.

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth/access'
import { getVercelSystemHealth } from '@/lib/admin/system-health'

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
const startOfTodayISO = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }
const nz = (n: number | null | undefined) => n ?? 0

async function prospectCount(a: any): Promise<number> {
  const queue = await countRows(a, 'outreach_queue')
  if (queue != null) return queue
  return nz(await countRows(a, 'prospects'))
}

async function repliesCount(a: any): Promise<number> {
  const outreachReplies = await countRows(a, 'outreach_replies')
  if (outreachReplies != null) return outreachReplies
  return nz(await countRows(a, 'email_replies'))
}

async function draftedEmails(a: any): Promise<number> {
  const [queueDrafts, directDrafts] = await Promise.all([
    countRows(a, 'outreach_queue'),
    countRows(a, 'admin_audit_log', (q: any) => q.eq('action', 'sales.email_draft')),
  ])
  return nz(queueDrafts) + nz(directDrafts)
}

async function releasedOutreachCount(a: any): Promise<number> {
  const [actualSends, approvedOrSent] = await Promise.all([
    countRows(a, 'outreach_sends'),
    countRows(a, 'outreach_queue', (q: any) => q.in('status', ['approved', 'sent'])),
  ])
  return Math.max(nz(actualSends), nz(approvedOrSent))
}

async function releasedOutreachToday(a: any): Promise<number> {
  const [actualSendsToday, approvedToday, sentToday] = await Promise.all([
    countRows(a, 'outreach_sends', (q: any) => q.gte('sent_at', startOfTodayISO())),
    countRows(a, 'outreach_queue', (q: any) => q.gte('approved_at', startOfTodayISO())),
    countRows(a, 'outreach_queue', (q: any) => q.gte('sent_at', startOfTodayISO())),
  ])
  return Math.max(nz(actualSendsToday), nz(approvedToday), nz(sentToday))
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return '0%'
  return `${Math.round((numerator / denominator) * 100)}%`
}

async function sectionRows(a: any, section: string): Promise<string[][]> {
  try {
    if (section === 'system') {
      const [health, lastOutreach, lastProspect, errors, vercel] = await Promise.all([
        supabaseHealth(a), latest(a, 'outreach_sends', 'sent_at'), latest(a, 'outreach_queue'), countRows(a, 'error_logs'), getVercelSystemHealth(),
      ])
      const rows: string[][] = []
      rows.push(['Supabase', health ? 'Connected' : 'Unknown', health ? 'just now' : '—', health ? 'Health probe OK' : 'No response'])
      rows.push(['Vercel deployment health', vercel.deploymentStatus, vercel.latestDeploymentAt || vercel.checkedAt, vercel.details.deployment])
      rows.push(['Failed builds/deployments', vercel.failedBuilds == null ? vercel.failedBuildsStatus : String(vercel.failedBuilds), vercel.checkedAt, vercel.details.failedBuilds])
      rows.push(['Cron health', vercel.cronStatus, vercel.checkedAt, vercel.details.cron])
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
      const [prospects, approved, drafted, sent, today, replies, meetings, won, followups] = await Promise.all([
        prospectCount(a),
        countRows(a, 'outreach_queue', (q: any) => q.in('status', ['approved', 'sent'])),
        draftedEmails(a),
        releasedOutreachCount(a),
        releasedOutreachToday(a),
        repliesCount(a),
        countRows(a, 'sales_meetings'),
        countRows(a, 'subscriptions', (q: any) => q.in('plan', PAYING_PLANS)),
        countRows(a, 'outreach_queue', (q: any) => q.in('status', ['pending', 'approved'])),
      ])

      const sentCount = nz(sent)
      const prospectsCount = nz(prospects)
      const wonCount = nz(won)

      return [
        ['Prospects discovered', String(prospectsCount), '—', 'Outreach engine'],
        ['Prospects approved', String(nz(approved)), '—', 'Owner/Admin'],
        ['Emails drafted', String(nz(drafted)), '—', 'Sales draft engine'],
        ['Emails sent / released', String(sentCount), '—', 'Outreach approval/send workflow'],
        ['Daily outreach count', String(nz(today)), '—', 'Today'],
        ['Replies received', String(nz(replies)), pct(nz(replies), sentCount), 'Inbox/reply tracking'],
        ['Meetings booked', String(nz(meetings)), '—', 'Calendar/CRM'],
        ['Clients won', String(wonCount), pct(wonCount, prospectsCount), 'Subscriptions'],
        ['Next follow-ups', String(nz(followups)), '—', 'Pending/approved queue'],
      ]
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
    acc7, acc30, acc90, health, lastOutreach, lastProspect, vercel, rows,
  ] = await Promise.all([
    countRows(a, 'accounts'),
    countRows(a, 'subscriptions', (q: any) => q.in('plan', PAYING_PLANS)),
    countRows(a, 'subscriptions', (q: any) => q.eq('plan', 'free')),
    prospectCount(a),
    releasedOutreachCount(a),
    countRows(a, 'ai_task_log'),
    countRows(a, 'ai_business_sites'),
    countRows(a, 'video_jobs'),
    countRows(a, 'reviews'),
    countRows(a, 'error_logs'),
    countRows(a, 'accounts', (q: any) => q.gte('created_at', sinceISO(7))),
    countRows(a, 'accounts', (q: any) => q.gte('created_at', sinceISO(30))),
    countRows(a, 'accounts', (q: any) => q.gte('created_at', sinceISO(90))),
    supabaseHealth(a),
    latest(a, 'outreach_sends', 'sent_at'),
    latest(a, 'outreach_queue'),
    getVercelSystemHealth(),
    sectionRows(a, section),
  ])

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      totals: { accounts, paidSubs, freeSubs, prospects, outreachSends, aiTasks, sites, videos, reviews, errors },
      windows: { accounts7: acc7, accounts30: acc30, accounts90: acc90 },
      health: { supabase: health, errors, lastOutreach, lastProspect, vercel },
      rows,
    },
    { headers: { 'Cache-Control': 'no-store, private' } },
  )
}
