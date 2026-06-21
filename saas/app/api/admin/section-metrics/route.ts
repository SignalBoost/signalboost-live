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
