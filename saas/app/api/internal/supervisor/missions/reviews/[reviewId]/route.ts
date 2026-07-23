import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { SupabaseMissionManualReviewStore } from '@/lib/supervisor/missions/manual-review'
import { isManualReviewId, manualReviewDetailFields } from '@/lib/supervisor/missions/review-api'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ reviewId: string }> | { reviewId: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { reviewId } = await ctx.params
  if (!isManualReviewId(reviewId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const review = await new SupabaseMissionManualReviewStore(auth.admin).get(reviewId)
    if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: mission } = await auth.admin.from('mission_records').select('mission_id,mission_type,revision,status,environment,title,risk_level,created_at,updated_at,schema_version').eq('mission_id', review.missionId).maybeSingle()
    return NextResponse.json({ schemaVersion: 'mission-manual-review-detail-response-v1', ...manualReviewDetailFields(review), mission: mission ? { missionId:mission.mission_id, missionType:mission.mission_type, revision:mission.revision, status:mission.status, environment:mission.environment, title:mission.title, riskLevel:mission.risk_level, createdAt:mission.created_at, updatedAt:mission.updated_at, schemaVersion:mission.schema_version } : null })
  } catch {
    return NextResponse.json({ error: 'Manual review store unavailable' }, { status: 503 })
  }
}
