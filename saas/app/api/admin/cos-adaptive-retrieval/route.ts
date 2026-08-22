import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import {
  readAdaptiveRetrievalPolicyReport,
  refreshAdaptiveRetrievalShadowCandidate,
} from '@/lib/ai/cos/adaptiveRetrievalPolicy'
import { runNextAdaptiveRetrievalValidation } from '@/lib/ai/cos/adaptiveRetrievalValidation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown adaptive retrieval error')
}

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  try {
    const report = await readAdaptiveRetrievalPolicyReport()
    return NextResponse.json({
      ok: true,
      ...report,
      note: 'Adaptive retrieval remains shadow-only. validated_shadow does not change live Production retrieval policy.',
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorText(error) }, { status: 500 })
  }
}

export async function POST() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })
  try {
    const refreshed = await refreshAdaptiveRetrievalShadowCandidate()
    if (!refreshed.candidate.eligible) {
      return NextResponse.json({
        ok: false,
        blocked: true,
        candidate: refreshed.candidate,
        error: refreshed.candidate.reason,
      }, { status: 409 })
    }
    if (refreshed.policy?.status === 'validated_shadow') {
      return NextResponse.json({ ok: true, candidate: refreshed.candidate, policy: refreshed.policy, validation: null, alreadyValidated: true })
    }
    if (refreshed.policy?.status === 'rejected') {
      return NextResponse.json({ ok: false, blocked: true, candidate: refreshed.candidate, policy: refreshed.policy, error: 'The current retrieval candidate was rejected by controlled validation.' }, { status: 409 })
    }

    const validation = await runNextAdaptiveRetrievalValidation()
    const report = await readAdaptiveRetrievalPolicyReport()
    return NextResponse.json({
      ok: true,
      candidate: refreshed.candidate,
      validation,
      ...report,
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorText(error) }, { status: 500 })
  }
}
