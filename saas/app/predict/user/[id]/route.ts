// saas/app/api/predict/user/[id]/route.ts
// Host binding for the predictive layer. Returns forecast (next-best-actions + propensity)
// for a user, built from their mined features, recent events, and the global rule set.
// A user may predict for themselves; owner/admin may predict for anyone.

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { canReadUser } from '@/lib/cos/host'
import { getMiningStore } from '@/lib/cos/mining/storage'
import { forecastUser, recentTokensFromEvents } from '@/lib/cos/predictive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req as any)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  if (!canReadUser({ id: user.id, email: user.email, role: user.role }, id)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const store = getMiningStore()
  const sinceISO = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [features, recentEvents, rules] = await Promise.all([
    store.getUserFeatures(id),
    store.loadUserEvents(id, sinceISO, 500),
    store.getTopRules(200),
  ])

  const recentTokens = recentTokensFromEvents(recentEvents)
  const { predictions, propensity } = forecastUser(features, recentTokens, rules, 5)

  return NextResponse.json({ ok: true, user_id: id, predictions, propensity, features })
}
