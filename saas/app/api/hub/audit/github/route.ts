// saas/app/api/hub/audit/github/route.ts
// GitHub / Software Development report — owner-gated JSON. Collects a full
// snapshot and returns the deterministic GitHub change-control report.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildGithubReport } from '@/lib/audit/githubReport'

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
    const report = buildGithubReport(snapshot)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the GitHub report.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
