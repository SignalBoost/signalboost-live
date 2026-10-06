import { NextResponse } from 'next/server'
import { independentEvaluatorConfig, verifyIndependentEvaluatorPayload, COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE } from '@/lib/ai/cos/cosUniversityIndependentEvaluator'
import { recordAuthenticatedLabFailureVerdict } from '@/lib/ai/cos/cosLabFailureVerdictIngestion'
import { parseLabTrustedVerifierKeys } from '@/lib/ai/cos/cosLabTrustedVerifierKeys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const respond = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const config = await independentEvaluatorConfig()
  if (!config) return respond({ error: 'independent_evaluator_not_configured' }, 503)
  const profile = request.headers.get('x-itmounts-evaluator-profile') || ''
  const timestamp = request.headers.get('x-itmounts-evaluator-timestamp') || ''
  const idempotencyKey = request.headers.get('x-itmounts-evaluator-idempotency-key') || ''
  const signature = request.headers.get('x-itmounts-evaluator-signature') || ''
  if (profile !== COS_UNIVERSITY_INDEPENDENT_EVALUATOR_PROFILE || !idempotencyKey || idempotencyKey.length > 500 || !signature) return respond({ error: 'independent_evaluator_authentication_required' }, 401)
  const rawBody = await request.text()
  if (!rawBody || rawBody.length > 20_000) return respond({ error: 'lab_verdict_payload_invalid' }, 400)
  if (!verifyIndependentEvaluatorPayload({ secret: config.secret, timestamp, idempotencyKey, rawBody, signature })) return respond({ error: 'independent_evaluator_signature_invalid' }, 401)
  let payload: unknown
  try { payload = JSON.parse(rawBody) } catch { return respond({ error: 'lab_verdict_payload_invalid' }, 400) }
  // Keys are server-owned and explicitly provisioned; fail closed without them.
  const trustedVerifierKeys = parseLabTrustedVerifierKeys(process.env.COS_LAB_TRUSTED_FAILURE_VERIFIER_KEYS_JSON)
  if (!trustedVerifierKeys) return respond({ error: 'lab_verifier_trust_store_not_configured' }, 503)
  try {
    const recorded = await recordAuthenticatedLabFailureVerdict({ payload, idempotencyKey, trustedVerifierKeys })
    return respond(recorded)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'lab_verdict_rejected'
    return respond({ error: reason.slice(0, 200) }, reason === 'lab_verdict_duplicate_or_conflict_rejected' ? 409 : 422)
  }
}
