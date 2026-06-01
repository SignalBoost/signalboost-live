import { NextResponse } from 'next/server'
import { adminTelemetrySummary, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'
import { getCurrentAdminSession } from '@/lib/admin/adminAccess'

export async function GET() {
  const session = await getCurrentAdminSession()
  if (session.role !== 'admin') return NextResponse.json({ success: false, error: 'Admin access required.' }, { status: 403 })

  const rows = [
    ['module', 'event', 'area', 'audience', 'detail', 'status'],
    ...saasTelemetryEvents.map((event) => [event.module, event.event, event.area, event.audience, event.detail, event.status]),
  ]
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="signalboost-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
      'X-SignalBoost-Analytics': adminTelemetrySummary.title,
    },
  })
}
