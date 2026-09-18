import { NextRequest, NextResponse } from 'next/server'
import {
  COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
  recordUniversityTrainingExecutorEvidence,
  trainingExecutorConfigFromEnv,
  verifyTrainingExecutorPayload,
} from '@/lib/ai/cos/cosUniversityTrainingExecutor'
import { installHuggingFaceTrainingExecutorEnv } from '@/lib/ai/cos/cosUniversityHuggingFaceJobs'

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
    const result = await recordUniversityTrainingExecutorEvidence(body, { idempotencyKey })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.startsWith('training_executor_') ? 400 : 500
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
