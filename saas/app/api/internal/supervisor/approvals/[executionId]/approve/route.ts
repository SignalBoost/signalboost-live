import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'
import {
  defaultApprovalQueueStore,
  parseApproveDecision,
  validateLiveApprovalSession,
} from '@/lib/supervisor/approvals'
import {
  liveSandboxExecutionStore,
  liveSandboxSessionRegistry,
} from '@/lib/supervisor/executors/browser/live-sandbox-runtime'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ executionId: string }> },
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    parseApproveDecision(await req.json().catch(() => ({})))
    const { executionId } = await ctx.params
    const item = await defaultApprovalQueueStore.getRequest(executionId)

    if (!item || item.status !== 'pending') {
      return NextResponse.json({ code: 'request_not_actionable' }, { status: 409 })
    }

    await validateLiveApprovalSession({
      request: item,
      executionStore: liveSandboxExecutionStore,
      sessionRegistry: liveSandboxSessionRegistry,
    })

    await defaultApprovalQueueStore.approveRequest(
      executionId,
      auth.user.id,
      new Date().toISOString(),
    )

    return NextResponse.json({
      schemaVersion: 'supervisor-approval-decision-response-v1',
      code: 'approved_pending_runtime_continuation',
    })
  } catch (error: unknown) {
    const candidate = error as { code?: string; message?: string }
    const code = candidate.code || candidate.message || 'approval_failed'
    const status = [
      'request_expired',
      'execution_not_paused',
      'live_session_missing',
      'session_expired',
      'execution_mismatch',
      'phase_one_digest_mismatch',
      'remaining_scope_mismatch',
      'origin_mismatch',
      'task_fingerprint_mismatch',
    ].includes(code) ? 409 : 400

    return NextResponse.json({ code }, { status })
  }
}
