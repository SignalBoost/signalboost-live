// saas/app/api/hub/audit/secrets/route.ts
// Secrets & API Key Exposure — owner-gated JSON. Metadata only; no secret value
// ever leaves the server.

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { getReportSnapshot } from '@/lib/audit/snapshotCache'
import { getAdminSupabase } from '@/utils/supabase/server'
import { buildSecretsReport } from '@/lib/audit/secretsReport'

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
    const report = buildSecretsReport(snapshot)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build secrets report.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
