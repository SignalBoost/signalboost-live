// saas/app/api/hub/audit/stripe/route.ts
// Stripe / Payments Configuration report — owner-gated JSON. Collects a full
// snapshot and returns the deterministic billing configuration report.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { collectSnapshot } from '@/lib/audit/collectors'
import { buildStripeReport } from '@/lib/audit/stripeReport'

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
    const report = buildStripeReport(snapshot)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the Stripe report.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
