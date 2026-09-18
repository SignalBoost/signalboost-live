import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readMassDistillationCampaignPlan } from '@/lib/ai/cos/cosUniversityMassDistillationCampaignPlan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const requested = Number(req.nextUrl.searchParams.get('batches') || '')
  const result = await readMassDistillationCampaignPlan(Number.isFinite(requested) && requested > 0 ? requested : undefined)
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
