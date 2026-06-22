// saas/app/api/hub/audit/compliance/route.ts
// Compliance Readiness Matrix — owner-gated JSON. Collects a full snapshot and
// returns the deterministic readiness crosswalk (families × frameworks).

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildComplianceReport } from '@/lib/audit/complianceReport'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }

  try {
    const snapshot = await collectSnapshot()
    const report = buildComplianceReport(snapshot)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the compliance report.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
