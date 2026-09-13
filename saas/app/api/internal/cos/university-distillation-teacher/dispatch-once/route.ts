import { NextRequest, NextResponse } from 'next/server'
import {
  claimOneTimeTeacherDispatchApproval,
  finishOneTimeTeacherDispatchApproval,
} from '@/lib/ai/cos/cosUniversityOneTimeTeacherDispatch'
import {
  dispatchApprovedOneTimeTeacherDataset,
  isOneTimeTeacherProviderAcceptedAuditError,
} from '@/lib/ai/cos/cosUniversityOneTimeTeacherJob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  })
}

/**
 * Single-use bearer route for an already-recorded owner approval. The raw token is never stored or
 * echoed. Claiming is atomic before any provider call, and the receipt is terminal after the first
 * attempt. This route cannot authorize student training.
 */
export async function GET(req: NextRequest) {
  const rawToken = req.nextUrl.searchParams.get('approval') || ''
  let capability = null
  try {
    capability = await claimOneTimeTeacherDispatchApproval(rawToken)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('not_found') ? 404 : 400
    return response({ ok: false, error: message }, status)
  }

  try {
    const dispatched = await dispatchApprovedOneTimeTeacherDataset({ capability })
    await finishOneTimeTeacherDispatchApproval({
      capability,
      status: 'dispatched',
      jobId: dispatched.jobId,
      jobUrl: dispatched.jobUrl,
    })
    return response({
      ok: true,
      accepted: true,
      operation: dispatched.operation,
      candidateId: dispatched.candidateId,
      jobId: dispatched.jobId,
      jobUrl: dispatched.jobUrl,
      flavor: dispatched.flavor,
      hourlyCostUsd: dispatched.hourlyCostUsd,
      timeoutSeconds: dispatched.timeoutSeconds,
      maxEstimatedCostUsd: dispatched.maxEstimatedCostUsd,
      auditRecorded: dispatched.auditRecorded,
      reconciliationRequired: false,
      studentTrainingAuthorized: false,
    })
  } catch (error) {
    if (isOneTimeTeacherProviderAcceptedAuditError(error)) {
      const dispatched = error.acceptedDispatch
      let terminalReceiptRecorded = false
      try {
        await finishOneTimeTeacherDispatchApproval({
          capability,
          status: 'dispatched',
          jobId: dispatched.jobId,
          jobUrl: dispatched.jobUrl,
        })
        terminalReceiptRecorded = true
      } catch {
        // Provider acceptance remains authoritative. Do not downgrade or replay the external job.
      }
      return response({
        ok: false,
        accepted: true,
        operation: dispatched.operation,
        candidateId: dispatched.candidateId,
        jobId: dispatched.jobId,
        jobUrl: dispatched.jobUrl,
        flavor: dispatched.flavor,
        hourlyCostUsd: dispatched.hourlyCostUsd,
        timeoutSeconds: dispatched.timeoutSeconds,
        maxEstimatedCostUsd: dispatched.maxEstimatedCostUsd,
        auditRecorded: false,
        terminalReceiptRecorded,
        reconciliationRequired: true,
        error: error.message,
        studentTrainingAuthorized: false,
      }, 202)
    }

    const message = error instanceof Error ? error.message : String(error)
    try {
      await finishOneTimeTeacherDispatchApproval({
        capability,
        status: 'failed',
        error: message.split(':')[0],
      })
    } catch {
      // The original pre-provider failure remains authoritative; a finalization fault cannot retry it.
    }
    return response({ ok: false, accepted: false, error: message.split(':')[0] }, 400)
  }
}
