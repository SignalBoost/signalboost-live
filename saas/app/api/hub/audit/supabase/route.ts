// saas/app/api/hub/audit/supabase/route.ts
// Supabase / Database Security report — owner-gated JSON. Collects a full
// snapshot and returns the deterministic database security report.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getReportSnapshot } from '@/lib/audit/snapshotCache'
import { getAdminSupabase } from '@/utils/supabase/server'
import { buildSupabaseReport } from '@/lib/audit/supabaseReport'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }

  try {
    const snapshot = await getReportSnapshot(getAdminSupabase())
    const report = buildSupabaseReport(snapshot)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the Supabase report.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
