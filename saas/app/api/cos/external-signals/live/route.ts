import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { ingestLiveResearchSignals } from '@/lib/cos/external-signals/live-research'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const query = req.nextUrl.searchParams.get('query') || undefined
  const result = await ingestLiveResearchSignals(query)
  return NextResponse.json(result)
}
