import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { SupervisorValidationError } from '@/lib/supervisor/errors'
import { SupabaseMissionManualReviewStore } from '@/lib/supervisor/missions/manual-review'
import { manualReviewListFields, parseManualReviewListQuery } from '@/lib/supervisor/missions/review-api'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    const result = await new SupabaseMissionManualReviewStore(auth.admin).list(parseManualReviewListQuery(new URL(req.url).searchParams))
    return NextResponse.json({ schemaVersion: 'mission-manual-review-list-response-v1', items: result.items.map(manualReviewListFields), ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}) })
  } catch (error) {
    if (error instanceof SupervisorValidationError) return NextResponse.json({ error: 'Invalid review query' }, { status: 400 })
    return NextResponse.json({ error: 'Manual review store unavailable' }, { status: 503 })
  }
}
