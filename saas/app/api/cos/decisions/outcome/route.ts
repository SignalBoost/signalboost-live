// saas/app/api/cos/decisions/outcome/route.ts
// Owner/admin write: attach an outcome (approved/rejected/executed/measured) to
// a logged COS decision. This is the labeling step for the future predictive layer.
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/access'
import { updateCosDecisionOutcome, type CosDecisionStatus } from '@/lib/ai/cos/decisionLog'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID: CosDecisionStatus[] = ['logged', 'approved', 'rejected', 'executed', 'measured']

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status || 403 })

  let body: any = {}
  try { body = await req.json() } catch { body = {} }

  const decisionId = typeof body?.decisionId === 'string' ? body.decisionId : ''
  const status = body?.status as CosDecisionStatus | undefined
  const outcome = body?.outcome && typeof body.outcome === 'object' ? body.outcome : undefined

  if (!decisionId) return NextResponse.json({ ok: false, error: 'decisionId required' }, { status: 400 })
  if (status && !VALID.includes(status)) return NextResponse.json({ ok: false, error: 'invalid status' }, { status: 400 })

  const res = await updateCosDecisionOutcome(decisionId, { status, outcome })
  return NextResponse.json(res, { status: res.ok ? 200 : 500 })
}
