import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth/access'
import { getVercelSystemHealth } from '@/lib/admin/system-health'

export const dynamic = 'force-dynamic'

// Count rows; null if the table/column is absent or errors.
async function countRows(admin: any, table: string, filter?: (q: any) => any): Promise<number | null> {
  try {
    let q = admin.from(table).select('id', { count: 'exact', head: true })
    if (filter) q = filter(q)
    const { count, error } = await q
    if (error) return null
    return count ?? 0
  } catch { return null }
}

async function distinctCount(admin: any, table: string, column: string): Promise<number | null> {
  try {
    const { data, error } = await admin.from(table).select(column)
    if (error || !Array.isArray(data)) return null
    return new Set(data.map((r: any) => r?.[column]).filter((v: any) => v != null)).size
  } catch { return null }
}

async function latest(admin: any, table: string, col = 'created_at'): Promise<string | null> {
  try {
    const { data, error } = await admin.from(table).select(col).order(col, { ascending: false }).limit(1)
    if (error || !Array.isArray(data) || !data.length || !data[0]?.[col]) return null
    const d = new Date(data[0][col])
    if (isNaN(d.getTime())) return null
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return null }
}

async function failedBuildsMetric(): Promise<number | string> {
  const health = await getVercelSystemHealth()
  return health.failedBuilds == null ? health.failedBuildsStatus : health.failedBuilds
}

async function supabaseHealth(admin: any): Promise<string | null> {
  try {
    const { error } = await admin.from('subscriptions').select('id', { count: 'exact', head: true })
    return error ? null : 'Connected'
  } catch { return null }
}

const startOfTodayISO = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }
const PAYING_PLANS = ['launch', 'growth', 'command', 'paid', 'pro', 'starter']

const zeroIfMissing = async (value: Promise<number | null>): Promise<number> => (await value) ?? 0

async function prospectCount(a: any): Promise<number> {
  const queue = await countRows(a, 'outreach_queue')
  if (queue != null) return queue
  return zeroIfMissing(countRows(a, 'prospects'))
}

async function approvedProspects(a: any): Promise<number> {
  return zeroIfMissing(countRows(a, 'outreach_queue', (q: any) => q.in('status', ['approved', 'sent'])))
}

async function draftedEmails(a: any): Promise<number> {
  const [queueDrafts, directDrafts] = await Promise.all([
    countRows(a, 'outreach_queue'),
    countRows(a, 'admin_audit_log', (q: any) => q.eq('action', 'sales.email_draft')),
  ])
  return (queueDrafts ?? 0) + (directDrafts ?? 0)
}

async function releasedOutreachCount(a: any): Promise<number> {
  const [actualSends, approvedOrSent] = await Promise.all([
    countRows(a, 'outreach_sends'),
    countRows(a, 'outreach_queue', (q: any) => q.in('status', ['approved', 'sent'])),
  ])
  return Math.max(actualSends ?? 0, approvedOrSent ?? 0)
}

async function releasedOutreachToday(a: any): Promise<number> {
  const [actualSendsToday, approvedToday, sentToday] = await Promise.all([
    countRows(a, 'outreach_sends', (q: any) => q.gte('sent_at', startOfTodayISO())),
    countRows(a, 'outreach_queue', (q: any) => q.gte('approved_at', startOfTodayISO())),
    countRows(a, 'outreach_queue', (q: any) => q.gte('sent_at', startOfTodayISO())),
  ])
  return Math.max(actualSendsToday ?? 0, approvedToday ?? 0, sentToday ?? 0)
}

async function replyCount(a: any): Promise<number> {
  const replies = await countRows(a, 'outreach_replies')
  if (replies != null) return replies
  const emailReplies = await countRows(a, 'email_replies')
  return emailReplies ?? 0
}

async function meetingCount(a: any): Promise<number> {
  const meetings = await countRows(a, 'sales_meetings')
  if (meetings != null) return meetings
  return 0
}

async function responseRate(a: any): Promise<string> {
  const [sent, replies] = await Promise.all([
    releasedOutreachCount(a),
    replyCount(a),
  ])
  if (!sent) return '0%'
  return `${Math.round(((replies ?? 0) / sent) * 100)}%`
}

async function conversionRate(a: any): Promise<string> {
  const [won, prospects] = await Promise.all([
    countRows(a, 'subscriptions', (q: any) => q.in('plan', PAYING_PLANS)),
    prospectCount(a),
  ])
  if (!won || !prospects) return '0%'
  return `${Math.round((won / prospects) * 100)}%`
}

async function topValue(a: any, table: string, column: string): Promise<string | null> {
  try {
    const { data, error } = await a.from(table).select(column)
    if (error || !Array.isArray(data) || !data.length) return null
    const counts: Record<string, number> = {}
    for (const r of data) { const v = r?.[column]; if (v) counts[String(v)] = (counts[String(v)] || 0) + 1 }
    const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]
    return top ? top[0] : null
  } catch { return null }
}

async function topIndustry(a: any): Promise<string> {
  return (await topValue(a, 'prospects', 'industry')) || 'None yet'
}

async function topCountry(a: any): Promise<string> {
  return (await topValue(a, 'prospects', 'country')) || 'None yet'
}

async function avgMs(a: any, table: string, column: string): Promise<string | null> {
  try {
    const { data, error } = await a.from(table).select(column).limit(5000)
    if (error || !Array.isArray(data) || !data.length) return null
    const nums = data.map((r: any) => Number(r?.[column])).filter((n: number) => !isNaN(n))
    if (!nums.length) return null
    return `${Math.round(nums.reduce((acc: number, n: number) => acc + n, 0) / nums.length)}ms`
  } catch { return null }
}

type Spec = (a: any) => Promise<number | string | null>
const METRICS: Record<string, Spec> = {
  // Concierge Monitor
  'adm-0': a => countRows(a, 'assistant_conversations'),
  'adm-7': a => countRows(a, 'assistant_messages'),
  // SaaS Monitor
  'saas-0': a => countRows(a, 'accounts'),
  'saas-3': a => countRows(a, 'ai_business_sites'),
  'saas-5': a => countRows(a, 'video_jobs'),
  'saas-6': a => countRows(a, 'reviews'),
  'saas-7': a => countRows(a, 'ai_task_log'),
  'saas-9': a => countRows(a, 'subscriptions'),
  // Outreach + CRM — released outreach counts approved/sent queue items when send log rows are absent.
  'sales-0': a => prospectCount(a),
  'sales-1': a => approvedProspects(a),
  'sales-2': a => prospectCount(a),
  'sales-3': a => draftedEmails(a),
  'sales-4': a => releasedOutreachCount(a),
  'sales-5': a => replyCount(a),
  'sales-6': a => meetingCount(a),
  'sales-7': a => zeroIfMissing(countRows(a, 'subscriptions', (q: any) => q.in('plan', PAYING_PLANS))),
  'sales-8': a => releasedOutreachToday(a),
  'sales-9': a => responseRate(a),
  'sales-10': a => conversionRate(a),
  'sales-11': a => topIndustry(a),
  'sales-12': a => topCountry(a),
  'sales-13': a => zeroIfMissing(countRows(a, 'outreach_queue', (q: any) => q.in('status', ['pending', 'approved']))),
  // Forecasting + KPI
  'ai-0': a => countRows(a, 'ai_task_log'),
  // Email / Marketing
  'email-0': a => countRows(a, 'marketing_campaigns'),
  'email-1': a => countRows(a, 'admin_audit_log', (q: any) => q.eq('action', 'sales.email_draft')),
  'email-2': a => releasedOutreachCount(a),
  'email-4': a => replyCount(a),
  'email-5': a => countRows(a, 'marketing_campaigns'),
  // System Health
  'sys-0': a => countRows(a, 'error_logs'),
  'sys-1': async () => failedBuildsMetric(),
  'sys-2': a => supabaseHealth(a),
  'sys-3': async () => (await getVercelSystemHealth()).deploymentStatus,
  'sys-4': async () => (await getVercelSystemHealth()).cronStatus,
  'sys-5': a => releasedOutreachToday(a),
  'sys-6': a => latest(a, 'outreach_sends', 'sent_at'),
  'sys-7': a => latest(a, 'outreach_queue'),
  // Marketplace Monitor
  'sb-4': a => distinctCount(a, 'partner_businesses', 'category'),
  // Overview totals
  'overview-0': a => countRows(a, 'accounts'),
  'overview-6': a => countRows(a, 'ai_business_sites'),
  'overview-8': a => countRows(a, 'video_jobs'),
  'overview-9': a => countRows(a, 'reviews'),
  'overview-10': a => countRows(a, 'ai_task_log'),
  'overview-11': a => countRows(a, 'ai_task_log', (q: any) => q.eq('status', 'error')),
  'overview-12': a => releasedOutreachCount(a),
  'overview-13': a => prospectCount(a),
  // Forecasting + KPI
  'ai-1': a => countRows(a, 'ai_task_log', (q: any) => q.eq('provider', 'openai')),
  'ai-2': a => countRows(a, 'ai_task_log', (q: any) => q.in('provider', ['claude', 'anthropic'])),
  'ai-3': a => countRows(a, 'ai_task_log', (q: any) => q.eq('status', 'error')),
  'ai-4': a => avgMs(a, 'ai_task_log', 'duration_ms'),
  // Revenue
  'revenue-0': a => countRows(a, 'subscriptions', (q: any) => q.eq('plan', 'free')),
  'revenue-1': a => countRows(a, 'subscriptions', (q: any) => q.in('plan', PAYING_PLANS)),
  // Marketplace partners
  'partners-0': a => countRows(a, 'partner_businesses'),
  'partners-4': a => topValue(a, 'partner_businesses', 'category'),
  // System health
  'system-0': a => countRows(a, 'error_logs'),
  'system-2': a => supabaseHealth(a),
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const admin = getAdminSupabase()
  const entries = Object.entries(METRICS)
  const results = await Promise.all(entries.map(([, fn]) => fn(admin)))

  const values: Record<string, number | string> = {}
  entries.forEach(([key], i) => {
    const v = results[i]
    if (typeof v === 'number' || (typeof v === 'string' && v.length)) values[key] = v
  })

  return NextResponse.json({ generatedAt: new Date().toISOString(), values })
}
