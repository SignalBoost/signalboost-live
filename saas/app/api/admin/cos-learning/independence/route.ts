import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getCosIndependenceReport } from '@/lib/ai/cos/cognitiveIndependenceReport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const params = request.nextUrl.searchParams
  const report = await getCosIndependenceReport({
    windowDays: Number(params.get('days') || 30),
    rowLimit: Number(params.get('limit') || 2000),
  })

  return NextResponse.json({
    ok: true,
    report,
  })
}
