import { NextResponse } from 'next/server'
import {
  COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE,
  independentEvaluatorConfig,
  recordIndependentEvaluatorEvidence,
  verifyIndependentEvaluatorPayload,
} from '@/lib/ai/cos/cosUniversityIndependentEvaluator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function noStore(payload: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(payload, init)
  response.headers.set('Cache-Control', 'no-store, max-age=0')
  return response
}

function header(request: Request, name: string, max: number): string {
  return String(request.headers.get(name) || '').trim().slice(0, max)
}

export async function POST(request: Request) {
  const config = await independentEvaluatorConfig()
  if (!config) return noStore({ error: 'independent_evaluator_not_configured' }, { status: 503 })

  const profile = header(request, 'x-itmounts-evaluator-profile', 120)
  const timestamp = header(request, 'x-itmounts-evaluator-timestamp', 100)
  const idempotencyKey = header(request, 'x-itmounts-evaluator-idempotency-key', 500)
  const signature = header(request, 'x-itmounts-evaluator-signature', 128)
  if (profile !== COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE || !timestamp || !idempotencyKey || !signature) {
    return noStore({ error: 'independent_evaluator_authentication_required' }, { status: 401 })
  }

  const rawBody = await request.text()
  if (!rawBody || rawBody.length > 200_000) {
    return noStore({ error: 'independent_evaluator_payload_invalid' }, { status: 400 })
  }
  if (!verifyIndependentEvaluatorPayload({
    secret: config.secret,
    timestamp,
    idempotencyKey,
    rawBody,
    signature,
  })) {
    return noStore({ error: 'independent_evaluator_signature_invalid' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return noStore({ error: 'independent_evaluator_payload_invalid' }, { status: 400 })
  }

  try {
    const recorded = await recordIndependentEvaluatorEvidence({
      payload,
      observedAt: new Date(timestamp),
      idempotencyKey,
    })
    return noStore({
      ok: true,
      claim: recorded.claim,
      eventKey: recorded.eventKey,
      revisionKey: recorded.revisionKey,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'independent_evaluator_evidence_rejected'
    return noStore({ error: reason.slice(0, 500) }, { status: 422 })
  }
}
