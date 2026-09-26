import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  dispatchWorkingCosTraining,
  ensureWorkingCosCandidateReadiness,
  reconcileWorkingCosTrainingProviderJob,
  workingCosDispatchReadiness,
} from '@/lib/ai/cos/cosWorkingDistillationDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const APPROVED_CANDIDATE_ID = 'working-cos:d1be42c94d892b75bf272e3a34ad78e1'
const APPROVED_DATASET_HASH = 'fcbf51dae199418a11da0fb66a29b3098a7742e38e0b82a752c6a8a721b0eb52'
const APPROVED_FAILED_OOM_JOB_ID = '6ab749a06b030d633f69326e'
const APPROVED_REPAIR_FLAVOR = 'a100-large'
const APPROVED_REPAIR_ERROR_SIGNATURE = 'CUDA out of memory'
const APPROVAL_EXPIRES_AT = Date.parse('2026-09-26T05:00:00Z')

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (Date.now() >= APPROVAL_EXPIRES_AT) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'working_cos_owner_training_approval_expired',
      candidateId: APPROVED_CANDIDATE_ID,
      automaticActivationAuthorized: false,
      productionTrafficAuthorized: false,
    })
  }

  const db = cosServiceDb()
  if (!db) return NextResponse.json({ ok: false, error: 'service_database_unavailable' }, { status: 503 })

  const accepted = await db.from('cos_working_distillation_job_events')
    .select('job_id,job_url,created_at')
    .eq('candidate_id', APPROVED_CANDIDATE_ID)
    .eq('operation', 'train')
    .eq('event_type', 'provider_accepted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (accepted.error) return NextResponse.json({ ok: false, error: accepted.error.message }, { status: 500 })
  let repairedRetryAuthorized = false
  if (accepted.data?.job_id) {
    try {
      const reconciliation = await reconcileWorkingCosTrainingProviderJob({
        candidateId: APPROVED_CANDIDATE_ID,
        jobId: accepted.data.job_id,
        db,
      })
      console.info('[working-cos-owner-approved-train-reconcile]', JSON.stringify({
        candidateId: APPROVED_CANDIDATE_ID,
        jobId: accepted.data.job_id,
        providerStage: reconciliation.providerStage,
        terminal: reconciliation.terminal,
        callbackRecorded: reconciliation.callbackRecorded,
        retryAuthorized: reconciliation.retryAuthorized,
        providerLogTail: 'providerLogTail' in reconciliation ? reconciliation.providerLogTail : null,
      }))
      const providerLogTail = 'providerLogTail' in reconciliation ? String(reconciliation.providerLogTail || '') : ''
      repairedRetryAuthorized = accepted.data.job_id === APPROVED_FAILED_OOM_JOB_ID
        && reconciliation.terminal
        && !reconciliation.callbackRecorded
        && reconciliation.providerStage === 'ERROR'
        && providerLogTail.includes(APPROVED_REPAIR_ERROR_SIGNATURE)
        && process.env.COS_WORKING_DISTILLATION_HF_TRAINING_FLAVOR === APPROVED_REPAIR_FLAVOR

      if (!repairedRetryAuthorized) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: reconciliation.callbackRecorded
            ? 'working_cos_training_callbacks_recorded'
            : reconciliation.terminal
              ? 'working_cos_training_terminal'
              : 'working_cos_training_in_progress',
          candidateId: APPROVED_CANDIDATE_ID,
          jobId: accepted.data.job_id,
          jobUrl: accepted.data.job_url,
          reconciliation,
          automaticActivationAuthorized: false,
          productionTrafficAuthorized: false,
          universityGraduationClaimed: false,
        })
      }

      console.warn('[working-cos-owner-approved-train-repair-retry]', JSON.stringify({
        candidateId: APPROVED_CANDIDATE_ID,
        failedJobId: accepted.data.job_id,
        repairedFlavor: APPROVED_REPAIR_FLAVOR,
        providerStage: reconciliation.providerStage,
        totalAttemptCostCapUsd: 2.5,
        automaticActivationAuthorized: false,
        productionTrafficAuthorized: false,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[working-cos-owner-approved-train-reconcile]', JSON.stringify({
        ok: false,
        candidateId: APPROVED_CANDIDATE_ID,
        jobId: accepted.data.job_id,
        error: message,
      }))
      return NextResponse.json({
        ok: false,
        error: message,
        candidateId: APPROVED_CANDIDATE_ID,
        jobId: accepted.data.job_id,
        automaticActivationAuthorized: false,
        productionTrafficAuthorized: false,
        universityGraduationClaimed: false,
      }, { status: 500 })
    }
  }

  try {
    const dispatchReadiness = await workingCosDispatchReadiness()
    console.info('[working-cos-owner-approved-train-readiness]', JSON.stringify({
      bundleReady: dispatchReadiness.bundleReady,
      runtimeBindingReady: dispatchReadiness.runtimeBindingReady,
      providerInstalled: dispatchReadiness.providerInstalled,
      providerConfigured: dispatchReadiness.providerConfigured,
      globalDispatchEnabled: dispatchReadiness.globalDispatchEnabled,
      workingCosDispatchEnabled: dispatchReadiness.workingCosDispatchEnabled,
      trainingFlavorConfigured: dispatchReadiness.trainingFlavorConfigured,
      nextGate: dispatchReadiness.nextGate,
    }))
    if (!dispatchReadiness.trainingFlavorConfigured) throw new Error('working_cos_training_flavor_not_configured')

    if (!repairedRetryAuthorized) {
      const readiness = await ensureWorkingCosCandidateReadiness()
      if (readiness.candidateId !== APPROVED_CANDIDATE_ID) throw new Error('working_cos_owner_training_approval_candidate_drift')
      if (readiness.datasetHash !== APPROVED_DATASET_HASH) throw new Error('working_cos_owner_training_approval_dataset_drift')
    }

    const result = await dispatchWorkingCosTraining({
      confirmDispatch: true,
      candidateId: APPROVED_CANDIDATE_ID,
      expectedDatasetHash: APPROVED_DATASET_HASH,
    })
    return NextResponse.json({
      ok: true,
      ownerApprovalBound: true,
      expiresAt: new Date(APPROVAL_EXPIRES_AT).toISOString(),
      ...result,
      automaticActivationAuthorized: false,
      productionTrafficAuthorized: false,
      universityGraduationClaimed: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[working-cos-owner-approved-train]', JSON.stringify({
      ok: false,
      error: message,
      candidateId: APPROVED_CANDIDATE_ID,
    }))
    return NextResponse.json({
      ok: false,
      error: message,
      candidateId: APPROVED_CANDIDATE_ID,
      automaticActivationAuthorized: false,
      productionTrafficAuthorized: false,
      universityGraduationClaimed: false,
    }, { status: 500 })
  }
}
