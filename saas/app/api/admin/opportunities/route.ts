// saas/app/api/admin/opportunities/route.ts
// Owner/admin API for the Opportunities dashboard:
//   GET    → list recent alerts
//   POST   → run a scan now (manual trigger)
//   PATCH  → update an alert's status (reviewed / dismissed)

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import { listRecentAlerts, runOpportunityScan, updateAlertStatus } from '@/lib/ai/opportunityScanner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function requireAdmin(): Promise<boolean> {
  try {
    const access = await getAccess()
    return access.isAdmin
  } catch {
    return false
  }
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await listRecentAlerts(30)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ alerts: result.alerts })
}

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await runOpportunityScan()
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, inserted: result.inserted })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let id = ''
  let status = ''
  try {
    const body = await req.json()
    id = String(body?.id || '')
    status = String(body?.status || '')
  } catch {}
  if (!id || !['new', 'reviewed', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Provide id and a valid status (new/reviewed/dismissed).' }, { status: 400 })
  }
  const result = await updateAlertStatus(id, status as 'new' | 'reviewed' | 'dismissed')
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
