// saas/app/api/hub/audit/identity-access/route.ts
// Returns a full Identity & Access report as JSON.
// Owner-gated. Collects a live snapshot, builds the deterministic identity
// report, and returns it for the IdentityAccessReport component.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getReportSnapshot } from '@/lib/audit/snapshotCache'
import { getAdminSupabase } from '@/utils/supabase/server'
import { buildIdentityAccessReport } from '@/lib/audit/reports'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // Guard — owner only.
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json(
      { ok: false, error: guard.error },
      { status: guard.status },
    )
  }

  try {
    // getReportSnapshot() returns the cached AuditSnapshot (or a live one if the cache is empty).
    const snapshot = await getReportSnapshot(getAdminSupabase())

    // buildIdentityAccessReport() returns the report with `ok` on the object itself.
    const report = buildIdentityAccessReport(snapshot)
    if (!report.ok) {
      return NextResponse.json(
        { ok: false, error: report.error ?? 'Failed to build report.' },
        { status: 500 },
      )
    }

    // The page reads { ok, report } and passes report straight to the component.
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to collect identity data.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
