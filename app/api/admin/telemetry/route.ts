import { NextResponse } from 'next/server'
import { adminTelemetrySummary, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'
import { getCurrentAdminSession } from '@/lib/admin/adminAccess'

export async function GET() {
  const session = await getCurrentAdminSession()
  if (session.role !== 'admin') return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 403 })

  return NextResponse.json({ summary: adminTelemetrySummary, events: saasTelemetryEvents })
}
