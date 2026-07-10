// saas/app/api/hub/audit/email/route.ts
// Email Deliverability & DNS Health report — owner-gated JSON. Runs live DNS
// checks (MX/SPF/DKIM/DMARC) for every platform sender domain plus Resend
// domain verification, and returns the deterministic report.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { buildEmailHealthReport } from '@/lib/audit/emailHealthReport'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })
  }

  try {
    const report = await buildEmailHealthReport()
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the email health report.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
