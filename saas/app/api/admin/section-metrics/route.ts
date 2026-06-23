import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

// Count rows; null if the table/column is absent or errors (UI keeps its honest placeholder).
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

// Most recent timestamp in a table -> short date string (e.g. "Jun 20, 14:32"); null if none.
async function latest(admin: any, table: string, col = 'created_at'): Promise<string | null> {
  try {
    const { data, error } = await admin.from(table).select(col).order(col, { ascending: false }).limit(1)
    if (error || !Array.isArray(data) || !data.length || !data[0]?.[col]) return null
    const d = new Date(data[0][col])
    if (isNaN(d.getTime())) return null
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return null }
}

// Live connectivity probe -> 'Connected' if a trivial query succeeds, else null.
async function supabaseHealth(admin: any): Promise<string | null> {
  try {
    const { error } = await admin.from('subscriptions').select('id', { count: 'exact', head: true })
    return error ? null : 'Connected'
  } catch { return null }
}

const startOfTodayISO = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }

// Paying = a real (non-free) subscription plan. Covers current + legacy plan names.
const PAYING_PLANS = ['launch', 'growth', 'command', 'paid', 'pro', 'starter']

// Conversion rate = paying customers / prospects, as a percent string. null if no prospects.
async function conversionRate(a: any): Promise<string | null> {
  try {
    const won = await countRows(a, 'subscriptions', (q: any) => q.in('plan', PAYING_PLANS))
    const prospects = await countRows(a, 'prospects')
    if (won == null || prospects == null || prospects === 0) return null
    return `${Math.round((won / prospects) * 100)}%`
  } catch { return null }
}

// Most frequent value of a column (e.g. top industry/country). null if column/table absent.
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

// Average of a numeric column -> "Nms"; null if column/table absent or empty.
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
  // Outreach + CRM
  'sales-0': a => countRows(a, 'prospects'),
  'sales-4': a => countRows(a, 'outreach_sends'),
  'sales-8': a => countRows(a, 'outreach_sends', q => q.gte('created_at', startOfTodayISO())),
  'sales-7':  a => countRows(a, 'subscriptions', (q: any) => q.in('plan', PAYING_PLANS)), // clients won (paying)
  'sales-10': a => conversionRate(a),                                                     // conversion rate
  'sales-11': a => topValue(a, 'prospects', 'industry'),                                  // top industries
  'sales-12': a => topValue(a, 'prospects', 'country'),                                   // top countries
  // Forecasting + KPI
  'ai-0': a => countRows(a, 'ai_task_log'),
  // Email / Marketing
  'email-2': a => countRows(a, 'outreach_sends'),
  'email-5': a => countRows(a, 'marketing_campaigns'),
  // System Health
  'sys-0': a => countRows(a, 'error_logs'),
  'sys-2': a => supabaseHealth(a),
  'sys-5': a => countRows(a, 'outreach_sends', q => q.gte('created_at', startOfTodayISO())),
  'sys-6': a => latest(a, 'outreach_sends'),
  'sys-7': a => latest(a, 'prospects'),
  // Marketplace Monitor
  'sb-4': a => distinctCount(a, 'partner_businesses', 'category'),
  // ── Defensive wiring for the remaining cards: lights up when the table exists,
  //    stays an honest empty-state when it doesn't (every helper returns null on error).
  // Overview totals
  'overview-0':  a => countRows(a, 'accounts'),
  'overview-6':  a => countRows(a, 'ai_business_sites'),
  'overview-8':  a => countRows(a, 'video_jobs'),
  'overview-9':  a => countRows(a, 'reviews'),
  'overview-10': a => countRows(a, 'ai_task_log'),
  'overview-11': a => countRows(a, 'ai_task_log', (q: any) => q.eq('status', 'error')),
  'overview-12': a => countRows(a, 'outreach_sends'),
  'overview-13': a => countRows(a, 'prospects'),
  // Forecasting + KPI (AI routing health from ai_task_log)
  'ai-1': a => countRows(a, 'ai_task_log', (q: any) => q.eq('provider', 'openai')),
  'ai-2': a => countRows(a, 'ai_task_log', (q: any) => q.in('provider', ['claude', 'anthropic'])),
  'ai-3': a => countRows(a, 'ai_task_log', (q: any) => q.eq('status', 'error')),
  'ai-4': a => avgMs(a, 'ai_task_log', 'duration_ms'),
  // Revenue (from subscriptions)
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
