import { NextResponse } from 'next/server'
import { adminTelemetrySummary, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'

export async function GET() {
  return NextResponse.json({ summary: adminTelemetrySummary, events: saasTelemetryEvents })
}
