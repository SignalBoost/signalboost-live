// saas/app/api/features/user/[id]/route.ts
// Predictive-layer consumption endpoint. Returns the mined feature vector + segment for a
// user, conforming to the FEATURE_JSON_SCHEMA. A user may read their own features; owner
// and admin may read anyone's. Next 16 dynamic param shape (params is a Promise).

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { getMiningStore } from '@/lib/cos/mining/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req as any)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const privileged = user.role === 'owner' || user.role === 'admin'
  if (id !== user.id && !privileged) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const store = getMiningStore()
  const [features, segment] = await Promise.all([store.getUserFeatures(id), store.getUserSegment(id)])

  return NextResponse.json({
    ok: true,
    user_id: id,
    segment: segment ? segment.segment : null,
    // Each item validates against FEATURE_JSON_SCHEMA: { user_id, feature_name, value, timestamp }
    features,
    count: features.length,
  })
}
