import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import { independentEvaluatorConfig } from '@/lib/ai/cos/cosUniversityIndependentEvaluator'
import {
  runMassDistilledArtifactEvaluation,
  type MassEvaluationClaim,
} from '@/lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'
const COMPLETED = 'mass_distilled_independent_evaluation_completed'
const FAILED = 'mass_distilled_independent_evaluation_failed'
const ROUTE_BUDGET_MS = 570_000
const MIN_BALANCE_USD = 1
const HEX64 = /^[a-f0-9]{64}$/i
const ENDPOINT_ID = /^[A-Za-z0-9_-]{3,120}$/

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clean = (value: unknown, max = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

type RawClaim = Readonly<{
  candidate_id: string
  subject_id: string
  artifact_id: string
  artifact_hash: string
  revision_key: string
  dataset_hash: string
  endpoint_id: string
  approval_observed_at: string
  max_endpoint_calls: number
  max_judge_calls: number
  max_runtime_wake_attempts: number
  max_estimated_runtime_wake_cost_usd: number
  reservation_event_key: string
}>

async function claimNext(): Promise<MassEvaluationClaim | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.rpc('claim_next_mass_distilled_evaluation')
  if (result.error) throw result.error
  const row = Array.isArray(result.data) ? result.data[0] as RawClaim | undefined : undefined
  if (!row) return null

  const candidateId = clean(row.candidate_id, 240)
  const subjectId = clean(row.subject_id, 240)
  const artifactId = clean(row.artifact_id, 500)
  const artifactHash = clean(row.artifact_hash, 64).toLowerCase()
  const revisionKey = clean(row.revision_key, 64).toLowerCase()
  const datasetHash = clean(row.dataset_hash, 64).toLowerCase()
  const endpointId = clean(row.endpoint_id, 120)
  const approvalObservedAt = clean(row.approval_observed_at, 80)
  const reservationEventKey = clean(row.reservation_event_key, 64)
  const maxEndpointCalls = Number(row.max_endpoint_calls)
  const maxJudgeCalls = Number(row.max_judge_calls)
  const maxRuntimeWakeAttempts = Number(row.max_runtime_wake_attempts)
  const maxEstimatedRuntimeWakeCostUsd = Number(row.max_estimated_runtime_wake_cost_usd)

  if (!candidateId.startsWith('mass:') || !subjectId || !artifactId
    || !HEX64.test(artifactHash) || !HEX64.test(revisionKey) || !HEX64.test(datasetHash)
    || !ENDPOINT_ID.test(endpointId) || !approvalObservedAt || !HEX64.test(reservationEventKey)
    || maxEndpointCalls !== 8 || maxJudgeCalls !== 4 || maxRuntimeWakeAttempts !== 1
    || !Number.isFinite(maxEstimatedRuntimeWakeCostUsd)
    || maxEstimatedRuntimeWakeCostUsd <= 0 || maxEstimatedRuntimeWakeCostUsd > 0.2) {
    throw new Error('mass_distilled_evaluation_atomic_claim_invalid')
  }

  return Object.freeze({
    candidateId,
    subjectId,
    artifactId,
    artifactHash,
    revisionKey,
    datasetHash,
    endpointId,
    approvalObservedAt,
    maxEndpointCalls,
    maxJudgeCalls,
    maxRuntimeWakeAttempts,
    maxEstimatedRuntimeWakeCostUsd,
    reservationEventKey,
  })
}

async function recordTerminal(input: {
  claim: MassEvaluationClaim
  eventClaim: typeof COMPLETED | typeof FAILED
  evidence: Record<string, unknown>
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const body = {
    profile: PROFILE,
    claim: input.eventClaim,
    candidateId: input.claim.candidateId,
    artifactHash: input.claim.artifactHash,
    revisionKey: input.claim.revisionKey,
    endpointId: input.claim.endpointId,
    reservationEventKey: input.claim.reservationEventKey,
    authorizationObservedAt: input.claim.approvalObservedAt,
    ...input.evidence,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  }
  const evidenceHash = hash(body)
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: hash([PROFILE, input.eventClaim, input.claim.candidateId, input.claim.artifactHash, input.claim.reservationEventKey]),
    event_type: 'fine_tune',
    subject_id: input.claim.subjectId,
    candidate_id: input.claim.candidateId,
    evidence_hash: evidenceHash,
    evidence: body,
    verifier: 'host_controller',
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  let claim: MassEvaluationClaim | null = null
  try {
    const evaluator = await independentEvaluatorConfig()
    if (!evaluator) return NextResponse.json({ ok: true, skipped: true, reason: 'independent_evaluator_not_configured' })
    if (!process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET) {
      process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET = evaluator.secret
    }

    // Read-only provider balance check happens before consuming the single evaluation authorization.
    const account = await queryRunpodAccountStatus()
    if (account.clientBalance !== null && account.clientBalance < MIN_BALANCE_USD) {
      return NextResponse.json({ ok: false, error: 'runpod_balance_guard', balance: account.clientBalance }, { status: 402 })
    }

    claim = await claimNext()
    if (!claim) return NextResponse.json({ ok: true, skipped: true, reason: 'no_atomically_claimable_mass_distilled_evaluation' })

    const deadlineMs = Date.now() + ROUTE_BUDGET_MS
    const result = await runMassDistilledArtifactEvaluation({ claim, deadlineMs, now: new Date() })
    await recordTerminal({
      claim,
      eventClaim: COMPLETED,
      evidence: {
        evaluationPassed: result.evaluationPassed,
        nextStatus: result.nextStatus,
        evaluatorId: result.evaluatorId,
        model: result.model,
        endpointCalls: result.endpointCalls,
        judgeCalls: result.judgeCalls,
        holdout: result.holdout,
        safety: result.safety,
        transfer: result.transfer,
        retention: result.retention,
      },
    })
    console.info('[cos-mass-distilled-independent-evaluation]', JSON.stringify(result))
    return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (claim) {
      await recordTerminal({
        claim,
        eventClaim: FAILED,
        evidence: { error: clean(message, 500) },
      }).catch(() => undefined)
    }
    console.error('[cos-mass-distilled-independent-evaluation]', JSON.stringify({ ok: false, error: clean(message, 500) }))
    return NextResponse.json({ ok: false, error: clean(message, 500) }, { status: 500 })
  }
}
