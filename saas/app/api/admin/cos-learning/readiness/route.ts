import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { getLearningReadiness } from '@/lib/cos-core/layers/learning/readiness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  return NextResponse.json({
    ok: true,
    learning: getLearningReadiness(),
  })
}
