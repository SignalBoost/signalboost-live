import { NextRequest, NextResponse } from 'next/server'
import {
  claimOneTimeDatasetPreparationApproval,
  finishOneTimeDatasetPreparationApproval,
} from '@/lib/ai/cos/cosUniversityOneTimeDatasetPreparationDispatch'
import {
  dispatchApprovedOneTimeDatasetPreparation,
  isOneTimeDatasetPreparationProviderAcceptedAuditError,
} from '@/lib/ai/cos/cosUniversityOneTimeDatasetPreparationJob'

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

/** Single-use bearer route for an already-recorded owner-approved dataset preparation job. */
export async function GET(req: NextRequest) {
  const rawToken = req.nextUrl.searchParams.get('approval') || ''
  let capability = null
  try {
    capability = await claimOneTimeDatasetPreparationApproval(rawToken)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('not_found') ? 404 : 400
    return response({ ok: false, error: message }, status)
  }

  try {
    const dispatched = await dispatchApprovedOneTimeDatasetPreparation({ capability })
    await finishOneTimeDatasetPreparationApproval({
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
      baseModel: dispatched.baseModel,
      datasetHash: dispatched.datasetHash,
      flavor: dispatched.flavor,
      hourlyCostUsd: dispatched.hourlyCostUsd,
      timeoutSeconds: dispatched.timeoutSeconds,
      maxEstimatedCostUsd: dispatched.maxEstimatedCostUsd,
      auditRecorded: dispatched.auditRecorded,
      reconciliationRequired: false,
      studentTrainingAuthorized: false,
    })
  } catch (error) {
    if (isOneTimeDatasetPreparationProviderAcceptedAuditError(error)) {
      const dispatched = error.acceptedDispatch
      let terminalReceiptRecorded = false
      try {
        await finishOneTimeDatasetPreparationApproval({
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
        candidateId: dispatched.candidateId,
        jobId: dispatched.jobId,
        jobUrl: dispatched.jobUrl,
        baseModel: dispatched.baseModel,
        datasetHash: dispatched.datasetHash,
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
      await finishOneTimeDatasetPreparationApproval({
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
