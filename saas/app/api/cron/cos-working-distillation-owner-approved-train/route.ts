import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  dispatchWorkingCosTraining,
  ensureWorkingCosCandidateReadiness,
  workingCosDispatchReadiness,
} from '@/lib/ai/cos/cosWorkingDistillationDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const APPROVED_CANDIDATE_ID = 'working-cos:d1be42c94d892b75bf272e3a34ad78e1'
const APPROVED_DATASET_HASH = 'fcbf51dae199418a11da0fb66a29b3098a7742e38e0b82a752c6a8a721b0eb52'
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
  if (accepted.data?.job_id) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'working_cos_training_already_accepted',
      candidateId: APPROVED_CANDIDATE_ID,
      jobId: accepted.data.job_id,
      jobUrl: accepted.data.job_url,
      automaticActivationAuthorized: false,
      productionTrafficAuthorized: false,
    })
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

    const readiness = await ensureWorkingCosCandidateReadiness()
    if (readiness.candidateId !== APPROVED_CANDIDATE_ID) throw new Error('working_cos_owner_training_approval_candidate_drift')
    if (readiness.datasetHash !== APPROVED_DATASET_HASH) throw new Error('working_cos_owner_training_approval_dataset_drift')

    const result = await dispatchWorkingCosTraining({ confirmDispatch: true })
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
