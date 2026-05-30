import { NextResponse } from 'next/server'
import { requireAdminAccess } from '@/lib/admin/accessControl'
import { adminTelemetrySummary, executiveTelemetry, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'

export async function GET(req: Request) {
  const access = requireAdminAccess(req.headers)

  if (!access.allowed) {
    return NextResponse.json({ error: access.reason, role: access.role }, { status: 403 })
  }

  return NextResponse.json({
    summary: adminTelemetrySummary,
    executive: executiveTelemetry,
    events: saasTelemetryEvents,
  })
}
