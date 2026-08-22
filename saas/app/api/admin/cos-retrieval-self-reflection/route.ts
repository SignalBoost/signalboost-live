import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { readRetrievalSelfReflectionReport } from '@/lib/ai/cos/retrievalSelfReflectionStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const requested = Number(request.nextUrl.searchParams.get('limit') || 500)
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(1000, Math.floor(requested))) : 500
  const result = await readRetrievalSelfReflectionReport(limit)
  if (!result.ok) return NextResponse.json(result, { status: 503 })
  return NextResponse.json(result)
}
