// saas/app/api/hub/audit/identity-access/route.ts
// Returns a full Identity & Access report as JSON.
// Owner-gated. Collects a live snapshot, builds the deterministic identity
// report, and returns it for the IdentityAccessReport component.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildIdentityAccessReport } from '@/lib/audit/reports'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // Guard — owner only.
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json(
      { ok: false, error: guard.error },
      { status: guard.status },
    )
  }

  try {
    // collectSnapshot() resolves to an AuditSnapshot directly — no { ok } wrapper.
    const snapshot = await collectSnapshot()

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
