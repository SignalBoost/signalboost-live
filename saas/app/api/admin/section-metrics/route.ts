import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'

// Safely count rows in a table; returns null if the table doesn't exist or errors,
// so the UI can keep its honest "Not tracked yet" placeholder rather than a fake 0.
async function countRows(admin: any, table: string, filter?: (q: any) => any): Promise<number | null> {
  try {
    let q = admin.from(table).select('id', { count: 'exact', head: true })
    if (filter) q = filter(q)
    const { count, error } = await q
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

// Distinct count helper (best-effort) for "categories present" style metrics.
async function distinctCount(admin: any, table: string, column: string): Promise<number | null> {
  try {
    const { data, error } = await admin.from(table).select(column)
    if (error || !Array.isArray(data)) return null
    return new Set(data.map((r: any) => r?.[column]).filter((v: any) => v != null)).size
  } catch {
    return null
  }
}

// Each metric.key (from lib/admin/sections.ts) -> a real query against the live schema.
// Metrics with no backing table are intentionally omitted; they stay "Not tracked yet".
type MetricSpec = (admin: any) => Promise<number | null>
const METRICS: Record<string, MetricSpec> = {
  // Concierge Monitor (adm-)
  'adm-0': a => countRows(a, 'assistant_conversations'),
  'adm-7': a => countRows(a, 'assistant_messages'),

  // SaaS Monitor (saas-)
  'saas-0': a => countRows(a, 'accounts'),
  'saas-3': a => countRows(a, 'ai_business_sites'),
  'saas-5': a => countRows(a, 'video_jobs'),
  'saas-6': a => countRows(a, 'reviews'),
  'saas-7': a => countRows(a, 'ai_task_log'),
  'saas-9': a => countRows(a, 'subscriptions'),

  // Outreach + CRM (sales-)
  'sales-0': a => countRows(a, 'prospects'),
  'sales-4': a => countRows(a, 'outreach_sends'),

  // Forecasting + KPI (ai-)
  'ai-0': a => countRows(a, 'ai_task_log'),

  // Email / Marketing (email-)
  'email-2': a => countRows(a, 'outreach_sends'),
  'email-5': a => countRows(a, 'marketing_campaigns'),

  // System Health (sys-)
  'sys-0': a => countRows(a, 'error_logs'),

  // Marketplace Monitor (sb-)
  'sb-4': a => distinctCount(a, 'partner_businesses', 'category'),
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const admin = getAdminSupabase()
  const entries = Object.entries(METRICS)
  const results = await Promise.all(entries.map(([, fn]) => fn(admin)))

  const values: Record<string, number> = {}
  entries.forEach(([key], i) => {
    const v = results[i]
    if (typeof v === 'number') values[key] = v
  })

  return NextResponse.json({ generatedAt: new Date().toISOString(), values })
}
