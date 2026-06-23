import { NextResponse } from 'next/server'
import { adminTelemetrySummary, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'
import { getMarketingAdmin } from '@/lib/auth/marketingAdmin'

export const dynamic = 'force-dynamic'

// Admin-only telemetry must never be cached by browsers or intermediaries.
// force-dynamic prevents Next.js static caching but is not an HTTP directive,
// so we set Cache-Control explicitly on every response.
const NO_STORE = { 'Cache-Control': 'no-store, private' } as const

export async function GET() {
  const { user, isAdmin } = await getMarketingAdmin()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE })
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

  return NextResponse.json({ summary: adminTelemetrySummary, events }, { headers: NO_STORE })
}
