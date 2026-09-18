import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readUniversityDistillationReadiness } from '@/lib/ai/cos/cosUniversityDistillationReadiness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  const requested = Number(req.nextUrl.searchParams.get('hours') || '24')
  const hours = Number.isFinite(requested) ? Math.max(1, Math.min(720, Math.floor(requested))) : 24
  const result = await readUniversityDistillationReadiness(new Date(), hours)
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
