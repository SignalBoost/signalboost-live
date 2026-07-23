import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { SupabaseMissionManualReviewStore } from '@/lib/supervisor/missions/manual-review'
import { createManualReviewDiagnosticsResponse } from '@/lib/supervisor/missions/review-diagnostics'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    return NextResponse.json(createManualReviewDiagnosticsResponse(await new SupabaseMissionManualReviewStore(auth.admin).diagnostics(), new Date().toISOString()))
  } catch {
    return NextResponse.json({ error: 'Manual review diagnostics unavailable' }, { status: 503 })
  }
}
