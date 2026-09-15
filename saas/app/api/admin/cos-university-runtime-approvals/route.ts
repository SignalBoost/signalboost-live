// saas/app/api/admin/cos-university-runtime-approvals/route.ts
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { issueDistilledEvaluationApproval, readDistilledEvaluationApprovalStatus } from '@/lib/ai/cos/cosUniversityRuntimeApprovals'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error, authRequired: true }, { status: guard.status })
  try {
    return NextResponse.json(await readDistilledEvaluationApprovalStatus(), { headers: NO_STORE })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: NO_STORE })
  }
}

export async function POST(request: Request) {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error, authRequired: true }, { status: guard.status })
  let body: any = null
  try { body = await request.json() } catch { body = null }
  // One kind only. Anything else is refused rather than guessed.
  if (String(body?.kind || '') !== 'distilled_evaluation') {
    return NextResponse.json({ ok: false, error: 'approval_kind_not_permitted' }, { status: 400, headers: NO_STORE })
  }
  try {
    const result = await issueDistilledEvaluationApproval({ ownerUserId: guard.ctx.userId ?? null })
    const status = result.ok ? 200 : result.error === 'too_close_to_evaluator_tick' ? 425 : 409
    return NextResponse.json(result, { status, headers: NO_STORE })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: NO_STORE })
  }
}
