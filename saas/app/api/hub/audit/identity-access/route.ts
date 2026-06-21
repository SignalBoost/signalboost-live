// saas/app/api/hub/audit/identity-access/route.ts
// Returns a full Identity & Access report as JSON.
// Owner-gated. Collects a live snapshot, runs the identity findings engine,
// and returns the structured report for the IdentityAccessReport component.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildIdentityAccessReport } from '@/lib/audit/reports'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // Guard — owner only
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json(
      { ok: false, error: guard.error },
      { status: guard.status },
    )
  }

  // Collect live snapshot
  const snapshotResult = await collectSnapshot()
  if (!snapshotResult.ok) {
    return NextResponse.json(
      { ok: false, error: snapshotResult.error ?? 'Failed to collect snapshot.' },
      { status: 500 },
    )
  }

  // Build report
  const reportResult = buildIdentityAccessReport(snapshotResult.snapshot)
  if (!reportResult.ok) {
    return NextResponse.json(
      { ok: false, error: reportResult.error ?? 'Failed to build report.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, report: reportResult.report })
}
