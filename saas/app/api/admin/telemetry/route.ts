// app/api/admin/telemetry/route.ts
// Admin telemetry summary. Now gated: an unauthenticated caller no longer gets
// this endpoint (it was public). Data here is derived from static module config,
// but an admin-named endpoint should never answer anonymous requests.
import { NextResponse } from 'next/server'
import { adminTelemetrySummary, saasTelemetryEvents } from '@/lib/admin/saasTelemetry'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'

export async function GET() {
  const supabase = await createMarketingServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ summary: adminTelemetrySummary, events: saasTelemetryEvents })
}
