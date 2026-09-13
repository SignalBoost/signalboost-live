import { NextRequest, NextResponse } from 'next/server'
import {
  claimOneTimeStudentTrainingApproval,
  finishOneTimeStudentTrainingApproval,
} from '@/lib/ai/cos/cosUniversityOneTimeStudentTrainingDispatch'
import {
  dispatchApprovedOneTimeStudentTraining,
  isOneTimeStudentTrainingProviderAcceptedAuditError,
} from '@/lib/ai/cos/cosUniversityOneTimeStudentTrainingJob'

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

/** Single-use bearer route for one already-recorded owner-approved distillation training run. */
export async function GET(req: NextRequest) {
  const rawToken = req.nextUrl.searchParams.get('approval') || ''
  let capability = null
  try {
    capability = await claimOneTimeStudentTrainingApproval(rawToken)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('not_found') ? 404 : 400
    return response({ ok: false, error: message }, status)
  }

  try {
    const dispatched = await dispatchApprovedOneTimeStudentTraining({ capability })
    await finishOneTimeStudentTrainingApproval({
      capability,
      status: 'dispatched',
      jobId: dispatched.jobId,
      jobUrl: dispatched.jobUrl,
    })
    return response({
      ok: true,
      accepted: true,
      operation: dispatched.operation,
      trainingMode: dispatched.trainingMode,
      candidateId: dispatched.candidateId,
      jobId: dispatched.jobId,
      jobUrl: dispatched.jobUrl,
      revisionKey: dispatched.revisionKey,
      flavor: dispatched.flavor,
      hourlyCostUsd: dispatched.hourlyCostUsd,
      timeoutSeconds: dispatched.timeoutSeconds,
      maxEstimatedCostUsd: dispatched.maxEstimatedCostUsd,
      auditRecorded: dispatched.auditRecorded,
      reconciliationRequired: false,
      automaticPromotionAuthorized: false,
    })
  } catch (error) {
    if (isOneTimeStudentTrainingProviderAcceptedAuditError(error)) {
      const dispatched = error.acceptedDispatch
      let terminalReceiptRecorded = false
      try {
        await finishOneTimeStudentTrainingApproval({
          capability,
          status: 'dispatched',
          jobId: dispatched.jobId,
          jobUrl: dispatched.jobUrl,
        })
        terminalReceiptRecorded = true
      } catch {
        // Provider acceptance remains authoritative; do not replay the external job.
      }
      return response({
        ok: false,
        accepted: true,
        operation: dispatched.operation,
        trainingMode: dispatched.trainingMode,
        candidateId: dispatched.candidateId,
        jobId: dispatched.jobId,
        jobUrl: dispatched.jobUrl,
        revisionKey: dispatched.revisionKey,
        flavor: dispatched.flavor,
        hourlyCostUsd: dispatched.hourlyCostUsd,
        timeoutSeconds: dispatched.timeoutSeconds,
        maxEstimatedCostUsd: dispatched.maxEstimatedCostUsd,
        auditRecorded: false,
        terminalReceiptRecorded,
        reconciliationRequired: true,
        error: error.message,
        automaticPromotionAuthorized: false,
      }, 202)
    }

    const message = error instanceof Error ? error.message : String(error)
    try {
      await finishOneTimeStudentTrainingApproval({
        capability,
        status: 'failed',
        error: message.split(':')[0],
      })
    } catch {
      // Preserve the original pre-provider failure.
    }
    return response({ ok: false, accepted: false, error: message.split(':')[0] }, 400)
  }
}
