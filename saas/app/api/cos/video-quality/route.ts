import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { buildVideoQualityComparison } from '@/lib/cos/video-quality'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const comparison = buildVideoQualityComparison()
  return NextResponse.json({ ok: true, comparison })
}
