// saas/app/api/hub/audit/vercel/route.ts
// Cloud / Deployment Configuration report (Vercel) — owner-gated JSON. Collects
// a full snapshot and returns the deterministic deployment configuration report.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildVercelReport } from '@/lib/audit/vercelReport'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }

  try {
    const snapshot = await collectSnapshot()
    const report = buildVercelReport(snapshot)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the deployment report.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
