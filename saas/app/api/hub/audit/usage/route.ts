// saas/app/api/hub/audit/usage/route.ts
// AI Usage dashboard data — owner-gated. Reads the user_audit_usage ledger via
// the service-role client (owner needs to see ALL users for billing/throttle),
// aggregates in-process, and returns the dashboard summary.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { createClient } from '@supabase/supabase-js'
import { aggregateUsage, type UsageRow } from '@/lib/audit/usageReport'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const WINDOW_DAYS = 30

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ ok: true, report: aggregateUsage([], WINDOW_DAYS) })
    }
    // Untyped client: user_audit_usage isn't in the generated Database types.
    const db: any = createClient(url, key, { auth: { persistSession: false } })
    const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString()

    const { data, error } = await db
      .from('user_audit_usage')
      .select('user_id,feature,model,input_tokens,output_tokens,cache_creation_tokens,cache_read_tokens,cost_usd,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10000)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const report = aggregateUsage((data || []) as UsageRow[], WINDOW_DAYS)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build usage report.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
