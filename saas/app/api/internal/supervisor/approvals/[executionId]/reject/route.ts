import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import { defaultApprovalQueueStore, parseRejectDecision } from '@/lib/supervisor/approvals'

async function readDecisionBody(req: NextRequest): Promise<unknown> {
  const contentType = req.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return req.json()
  }

  const form = await req.formData()
  return {
    reasonCode: form.get('reasonCode'),
    operatorNote: form.get('operatorNote') || undefined,
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ executionId: string }> },
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const body = parseRejectDecision(await readDecisionBody(req))
    const { executionId } = await ctx.params

    await defaultApprovalQueueStore.rejectRequest(
      executionId,
      auth.user.id,
      body.reasonCode,
      body.operatorNote,
      new Date().toISOString(),
    )

    return NextResponse.json({
      schemaVersion: 'supervisor-approval-decision-response-v1',
      code: 'rejected',
    })
  } catch (error: unknown) {
    const candidate = error as { code?: string; message?: string }
    return NextResponse.json(
      { code: candidate.code || candidate.message || 'rejection_failed' },
      { status: 400 },
    )
  }
}
