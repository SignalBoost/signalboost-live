import { NextResponse } from 'next/server'
import { adminTelemetrySummary, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'
import { getMarketingAdmin } from '@/lib/auth/marketingAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { user, isAdmin } = await getMarketingAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Curated projection only — never echo raw event payloads. The free-text
  // `detail` field is intentionally dropped from the response.
  const events = saasTelemetryEvents.map((e) => ({
    id: e.id,
    module: e.module,
    event: e.event,
    area: e.area,
    audience: e.audience,
    status: e.status,
  }))

  return NextResponse.json({ summary: adminTelemetrySummary, events })
}
