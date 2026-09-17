import { NextRequest, NextResponse } from 'next/server'
import {
  COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
  signTrainingExecutorPayload,
  trainingExecutorConfigFromEnv,
  verifyTrainingExecutorPayload,
} from '@/lib/ai/cos/cosUniversityTrainingExecutor'
import {
  buildHuggingFaceJobSpec,
  huggingFaceJobsConfigFromEnv,
  installHuggingFaceTrainingExecutorEnv,
  resolveHuggingFaceHardwareRate,
  resolveHuggingFaceNamespace,
  submitHuggingFaceJob,
} from '@/lib/ai/cos/cosUniversityHuggingFaceJobs'
import { createHuggingFaceWorkerUrl } from '@/lib/ai/cos/cosUniversityHuggingFaceWorkerAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function signedResponse(input: {
  body: Record<string, unknown>
  idempotencyKey: string
  secret: string
  status?: number
}) {
  const rawBody = JSON.stringify(input.body)
  const timestamp = new Date().toISOString()
  const signature = signTrainingExecutorPayload({
    secret: input.secret,
    timestamp,
    idempotencyKey: input.idempotencyKey,
    rawBody,
  })
  return new NextResponse(rawBody, {
    status: input.status ?? 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, max-age=0',
      'x-itmounts-training-profile': COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE,
      'x-itmounts-training-timestamp': timestamp,
      'x-itmounts-training-idempotency-key': input.idempotencyKey,
      'x-itmounts-training-signature': signature,
    },
  })
}

export async function POST(req: NextRequest) {
  installHuggingFaceTrainingExecutorEnv()
  const executor = trainingExecutorConfigFromEnv()
  if (!executor) {
    return NextResponse.json({ ok: false, error: 'huggingface_training_not_configured' }, { status: 503 })
  }

  // The repository is private. Generate a fresh short-lived signed iTMounts URL for every HF
  // submission instead of caching an unauthenticated raw.githubusercontent.com URL in process.env.
  // Explicit buyer-owned worker URLs still win and are passed through unchanged.
  const workerUrl = process.env.COS_UNIVERSITY_HF_WORKER_URL || createHuggingFaceWorkerUrl({
    origin: req.nextUrl.origin,
    secret: executor.secret,
  })
  const hf = huggingFaceJobsConfigFromEnv({ ...process.env, COS_UNIVERSITY_HF_WORKER_URL: workerUrl })
  if (!hf) {
    return NextResponse.json({ ok: false, error: 'huggingface_training_not_configured' }, { status: 503 })
  }
  if (process.env.COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED !== 'true') {
    return NextResponse.json({ ok: false, error: 'training_executor_dispatch_disabled' }, { status: 503 })
  }

  const rawBody = await req.text()
  const timestamp = req.headers.get('x-itmounts-training-timestamp') || ''
  const idempotencyKey = req.headers.get('x-itmounts-training-idempotency-key') || ''
  const signature = req.headers.get('x-itmounts-training-signature') || ''
  const profile = req.headers.get('x-itmounts-training-profile') || ''
  if (profile !== COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE || !idempotencyKey || !verifyTrainingExecutorPayload({
    secret: executor.secret,
    timestamp,
    idempotencyKey,
    rawBody,
    signature,
  })) {
    return NextResponse.json({ ok: false, error: 'huggingface_training_signature_invalid' }, { status: 401 })
  }

  let envelope: any = null
  try { envelope = JSON.parse(rawBody) } catch { envelope = null }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || envelope.profile !== COS_UNIVERSITY_TRAINING_EXECUTOR_PROFILE
    || envelope.authorityExpanded !== false) {
    return signedResponse({
      body: { accepted: false, error: 'huggingface_training_payload_invalid' },
      idempotencyKey,
      secret: executor.secret,
      status: 400,
    })
  }

  try {
    const callbackUrl = new URL(String(envelope.callbackPath || ''), req.nextUrl.origin).toString()
    const spec = buildHuggingFaceJobSpec({
      envelope,
      callbackUrl,
      idempotencyKey,
      callbackSecret: executor.secret,
      config: hf,
    })

    // Price is checked from Hugging Face immediately before submission. Configuration may lower the
    // owner-defined $1/hour ceiling, but cannot raise it. There is no automatic hardware escalation.
    const hardware = await resolveHuggingFaceHardwareRate({ flavor: spec.flavor, token: hf.token })
    if (hardware.hourlyCostUsd > hf.maxHourlyCostUsd) {
      throw new Error('huggingface_training_hourly_cost_cap_exceeded')
    }
    const maxEstimatedCostUsd = Number((hardware.hourlyCostUsd * spec.timeoutSeconds / 3600).toFixed(6))

    const namespace = await resolveHuggingFaceNamespace({ token: hf.token })
    const submitted = await submitHuggingFaceJob({ namespace, token: hf.token, spec })
    return signedResponse({
      body: {
        accepted: true,
        jobId: submitted.jobId,
        provider: 'huggingface-jobs',
        jobUrl: submitted.jobUrl,
        flavor: hardware.flavor,
        hourlyCostUsd: hardware.hourlyCostUsd,
        maxEstimatedCostUsd,
      },
      idempotencyKey,
      secret: executor.secret,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message.split(':')[0] : 'huggingface_training_submission_failed'
    return signedResponse({
      body: { accepted: false, error: reason },
      idempotencyKey,
      secret: executor.secret,
      status: 400,
    })
  }
}
