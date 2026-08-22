import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { loadReasoningOutcomeStatus } from '@/lib/ai/cos/reasoningOutcomeLearning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const problemClass = String(request.nextUrl.searchParams.get('problemClass') || '').trim().slice(0, 200)
  if (!problemClass) {
    return NextResponse.json({ ok: false, error: 'problemClass is required.' }, { status: 400 })
  }

  const preference = await loadReasoningOutcomeStatus(problemClass, { fresh: true })
  return NextResponse.json({
    ok: true,
    problemClass,
    preference,
    status: preference?.status ?? 'insufficient_evidence',
    recommendedWorkerRole: preference?.recommendedWorkerRole ?? null,
    recommendedReasonerLabel: preference?.recommendedReasonerLabel ?? null,
    reason: preference?.reason ?? 'No verified worker/model evidence has been recorded for this problem class yet.',
  })
}
