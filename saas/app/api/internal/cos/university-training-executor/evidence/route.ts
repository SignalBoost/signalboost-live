import { NextRequest, NextResponse } from 'next/server'
import {
  COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
  recordUniversityTrainingExecutorEvidence,
  trainingExecutorConfigFromEnv,
  verifyTrainingExecutorPayload,
} from '@/lib/ai/cos/cosUniversityTrainingExecutor'
import { installHuggingFaceTrainingExecutorEnv } from '@/lib/ai/cos/cosUniversityHuggingFaceJobs'
import { reconcileLocalDistillationCandidate } from '@/lib/ai/cos/cosLocalDistillationArtifacts'
import { recordWorkingCosTrainingExecutorEvidence } from '@/lib/ai/cos/cosWorkingDistillationDispatch'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { closeProviderCircuit } from '@/lib/supervisor/provider-circuit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  installHuggingFaceTrainingExecutorEnv()
  const config = trainingExecutorConfigFromEnv()
  if (!config) return NextResponse.json({ ok: false, error: 'training_executor_not_configured' }, { status: 503 })

  const rawBody = await req.text()
  const timestamp = req.headers.get('x-itmounts-training-timestamp') || ''
  const idempotencyKey = req.headers.get('x-itmounts-training-idempotency-key') || ''
  const signature = req.headers.get('x-itmounts-training-signature') || ''
  const profile = req.headers.get('x-itmounts-training-profile') || ''

  if (profile !== COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE || !idempotencyKey || !verifyTrainingExecutorPayload({
    secret: config.secret,
    timestamp,
    idempotencyKey,
    rawBody,
    signature,
  })) {
    return NextResponse.json({ ok: false, error: 'training_executor_signature_invalid' }, { status: 401 })
  }

  let body: any = null
  try { body = JSON.parse(rawBody) } catch { body = null }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: 'training_executor_payload_invalid' }, { status: 400 })
  }

  try {
    const candidateId = String(body.candidateId || '')
    const result = /^working-cos:[a-f0-9]{32}$/i.test(candidateId)
      ? await recordWorkingCosTrainingExecutorEvidence(body, { idempotencyKey })
      : await recordUniversityTrainingExecutorEvidence(body, { idempotencyKey })
    let providerCircuitRecovery: unknown = null
    if (body.claim === 'trained_artifact_registered') {
      const db = cosServiceDb()
      if (db) {
        try {
          providerCircuitRecovery = await closeProviderCircuit({
            db,
            providerId: 'huggingface',
            capability: 'model-training',
            verification: {
              profile: 'training_executor_success_closes_provider_circuit_v1',
              candidateId,
              claim: body.claim,
              idempotencyKey,
              trainedArtifactId: String(body.trainedArtifactId || ''),
              artifactHash: String(body.artifactHash || ''),
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error('[provider-circuit] successful training callback recovery failed', message)
          providerCircuitRecovery = { closed: false, retryable: true, error: message }
        }
      }
    }
    let localArtifactTracking: unknown = null
    if (body.claim === 'trained_artifact_registered' || body.claim === 'rollback_artifact_registered') {
      try {
        localArtifactTracking = await reconcileLocalDistillationCandidate(String(body.candidateId || ''))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[cos-local-distillation-artifact] immediate reconciliation failed', message)
        localArtifactTracking = { tracked: false, retryable: true, error: message }
      }
    }
    return NextResponse.json({ ...result, providerCircuitRecovery, localArtifactTracking }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.startsWith('training_executor_') ? 400 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
