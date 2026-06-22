// saas/app/api/hub/audit/activity/route.ts
// Audit Log & Activity Timeline — owner-gated. Reads the most recent
// hub_audit_log events and returns a shaped timeline + status summary.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { createClient } from '@supabase/supabase-js'
import { buildActivityReport, type ActivityRawRow } from '@/lib/audit/activityReport'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const LIMIT = 200

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  // Untyped: hub_audit_log isn't in the generated Database types.
  return createClient(url, key, { auth: { persistSession: false } }) as any
}

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  try {
    const client = db()
    if (!client) return NextResponse.json({ ok: true, report: buildActivityReport([]) })
    const { data, error } = await client
      .from('hub_audit_log')
      .select('id,created_at,actor,action,status,target,message')
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    const report = buildActivityReport((data || []) as ActivityRawRow[])
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the activity log.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
