import { NextRequest, NextResponse } from 'next/server'
import {
  COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
  trainingExecutorConfigFromEnv,
  verifyTrainingExecutorPayload,
} from '@/lib/ai/cos/cosUniversityTrainingExecutor'
import { installHuggingFaceTrainingExecutorEnv } from '@/lib/ai/cos/cosUniversityHuggingFaceJobs'
import { recordMassDistillationWorkerEvidence } from '@/lib/ai/cos/cosUniversityMassDistillationConsumer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

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
    return NextResponse.json({ ok: false, error: 'mass_distillation_callback_signature_invalid' }, { status: 401 })
  }

  let body: Record<string, unknown> | null = null
  try {
    const parsed: unknown = JSON.parse(rawBody)
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch { body = null }
  if (!body) return NextResponse.json({ ok: false, error: 'mass_distillation_callback_payload_invalid' }, { status: 400 })

  try {
    const result = await recordMassDistillationWorkerEvidence(body, { idempotencyKey })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[mass-distillation-evidence]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
