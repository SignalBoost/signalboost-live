// saas/app/api/cron/cos-university-mass-distilled-evaluation/route.ts
// saas/app/api/cron/cos-university-mass-distilled-evaluation/route.ts
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import { independentEvaluatorConfig } from '@/lib/ai/cos/cosUniversityIndependentEvaluator'
import { recordCosUniversityProductionPath } from '@/lib/ai/cos/cosUniversityProductionAssurance'
import { ensureMassDistilledEndpoint24Gb } from '@/lib/ai/cos/runpodMassDistilledProvisionV2'
import { configuredRunpodApiKey } from '@/lib/ai/cos/runpodConfig'
import { runpodServerlessRootUrl } from '@/lib/ai/cos/runpodServerlessDistilledProvision'
import {
  runMassDistilledArtifactEvaluation,
  type MassEvaluationClaim,
} from '@/lib/ai/cos/cosUniversityMassDistilledArtifactEvaluation'
import {
  MASS_EVALUATION_APPROVAL_TTL_MS,
  decideRollingMassEvaluationApproval,
  type RollingArtifact,
  type RollingEvent,
} from '@/lib/ai/cos/cosUniversityMassEvaluationRollingAuthority'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'
const COMPLETED = 'mass_distilled_independent_evaluation_completed'
const FAILED = 'mass_distilled_independent_evaluation_failed'
const ROUTE_BUDGET_MS = 570_000
const ROUTE_RESERVE_MS = 25_000
const RUNTIME_WAKE_TIMEOUT_MS = 20_000
const MIN_BALANCE_USD = 1
const HEX64 = /^[a-f0-9]{64}$/i
const ENDPOINT_ID = /^[A-Za-z0-9_-]{3,120}$/

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const clean = (value: unknown, max = 1000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

async function recordProduction(invocationSucceeded: boolean, evidence: Record<string, unknown>) {
  await recordCosUniversityProductionPath({
    path: 'mass_distilled_independent_evaluation',
    invocationSucceeded,
    evidence,
  })
}

async function wakeMassDistilledRuntime(endpointId: string, deadlineMs: number) {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('mass_distilled_evaluation_runpod_key_missing')
  const remainingMs = deadlineMs - Date.now() - ROUTE_RESERVE_MS
  if (remainingMs <= 0) throw new Error('mass_distilled_evaluation_route_deadline_exceeded')
  const timeoutMs = Math.max(1, Math.min(RUNTIME_WAKE_TIMEOUT_MS, remainingMs))
  // /ping is only a scale-from-zero trigger. A cold RunPod LB request can stay open until a worker is
  // routable, so waiting minutes for its response consumes the evaluator's entire route budget. Dispatch
  // it briefly, then let the evaluator's /ready loop own startup readiness and the remaining deadline.
  try {
    const response = await fetch(`${runpodServerlessRootUrl(endpointId)}/ping`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 300)
      throw new Error(`mass_distilled_evaluation_runtime_wake_http_${response.status}:${detail}`)
    }
    const payload: any = await response.json().catch(() => null)
    if (String(payload?.status || '') !== 'accepting_requests') {
      throw new Error('mass_distilled_evaluation_runtime_wake_invalid')
    }
    return Object.freeze({
      ok: true as const,
      endpointId,
      responseObserved: true,
      modelReady: payload?.modelReady === true,
      tokenGeneratingRequest: false,
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    if (name !== 'TimeoutError' && name !== 'AbortError') throw error
    return Object.freeze({
      ok: true as const,
      endpointId,
      responseObserved: false,
      modelReady: false,
      wakeRequestTimedOut: true,
      tokenGeneratingRequest: false,
    })
  }
}

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

async function ensureRollingMassEvaluationApproval() {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const artifacts = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,subject_id,trained_artifact_hash,created_at')
    .eq('status', 'evaluation_pending')
    .like('candidate_id', 'mass:%')
    .order('created_at', { ascending: true })
    .limit(50)
  if (artifacts.error) throw artifacts.error
  const rows: RollingArtifact[] = (artifacts.data || []).map((row: any) => ({
    candidateId: clean(row.candidate_id, 240), subjectId: clean(row.subject_id, 240),
    artifactHash: clean(row.trained_artifact_hash, 64).toLowerCase(), createdAt: String(row.created_at || ''),
  }))
  if (!rows.length) return { issued: false, reason: 'no_mass_artifact_pending' }
  const events = await db.from('cos_university_learning_assurance_events')
    .select('event_key,candidate_id,observed_at,expires_at,verifier,evidence')
    .eq('event_type', 'fine_tune')
    .like('candidate_id', 'mass:%')
    .in('verifier', ['host_controller', 'host_production_verifier', 'independent_scorer'])
    .gte('observed_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
    .order('observed_at', { ascending: false })
    .limit(2000)
  if (events.error) throw events.error
  const reservations = await db.from('cos_university_learning_assurance_events')
    .select('event_key,candidate_id,observed_at,expires_at,verifier,evidence')
    .eq('event_type', 'fine_tune')
    .like('candidate_id', 'mass:%')
    .contains('evidence', { profile: 'cos_mass_distilled_independent_evaluation_runtime_v1' })
    .order('observed_at', { ascending: false })
    .limit(1000)
  if (reservations.error) throw reservations.error
  const seenEventKeys = new Set<string>()
  const uniqueRows = [...(events.data || []), ...(reservations.data || [])].filter((row: any) => {
    const key = String(row?.event_key || '')
    if (!key) return true
    if (seenEventKeys.has(key)) return false
    seenEventKeys.add(key)
    return true
  })
  const all: RollingEvent[] = uniqueRows.map((row: any) => ({
    candidateId: clean(row.candidate_id, 240), observedAt: String(row.observed_at || ''), expiresAt: row.expires_at ? String(row.expires_at) : null,
    verifier: clean(row.verifier, 80), evidence: row.evidence && typeof row.evidence === 'object' ? row.evidence : null,
  }))
  const now = new Date()
  const decision = decideRollingMassEvaluationApproval({
    enabled: process.env.COS_MASS_EVALUATION_ROLLING_AUTHORIZATION !== 'false',
    artifacts: rows,
    events: all,
    now,
  })
  if ('reason' in decision) return { issued: false, reason: decision.reason }
  const inserted = await db.from('cos_university_learning_assurance_events').insert({
    event_key: hash(['mass-rolling-evaluation-approval', decision.artifact.candidateId, decision.artifact.artifactHash, now.toISOString()]),
    event_type: 'fine_tune',
    subject_id: decision.artifact.subjectId || null,
    candidate_id: decision.artifact.candidateId,
    evidence_hash: hash(decision.evidence),
    evidence: decision.evidence,
    verifier: 'host_controller',
    observed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + MASS_EVALUATION_APPROVAL_TTL_MS).toISOString(),
  })
  if (inserted.error) throw inserted.error
  return { issued: true, candidateId: decision.artifact.candidateId, artifactHash: decision.artifact.artifactHash }
}

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
    if (!evaluator) {
      await recordProduction(true, {
        runnerInvoked: false,
        skipped: true,
        status: 'not_claimed',
        reason: 'independent_evaluator_not_configured',
      }).catch(() => undefined)
      return NextResponse.json({ ok: true, skipped: true, reason: 'independent_evaluator_not_configured' })
    }
    if (!process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET) {
      process.env.COS_UNIVERSITY_INDEPENDENT_EVALUATOR_SECRET = evaluator.secret
    }

    const account = await queryRunpodAccountStatus()
    if (account.clientBalance !== null && account.clientBalance < MIN_BALANCE_USD) {
      await recordProduction(false, {
        runnerInvoked: false,
        blocked: 'runpod_balance_guard',
        balance: account.clientBalance,
      }).catch(() => undefined)
      return NextResponse.json({ ok: false, error: 'runpod_balance_guard', balance: account.clientBalance }, { status: 402 })
    }

    const rolling = await ensureRollingMassEvaluationApproval()
    console.info('[cos-mass-distilled-rolling-authorization]', JSON.stringify(rolling))
    claim = await claimNext()
    if (!claim) {
      await recordProduction(true, {
        runnerInvoked: false,
        skipped: true,
        status: 'not_claimed',
        reason: 'no_atomically_claimable_mass_distilled_evaluation',
      }).catch(() => undefined)
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_atomically_claimable_mass_distilled_evaluation' })
    }

    const runtimePolicy = await ensureMassDistilledEndpoint24Gb(claim.endpointId)
    console.info('[cos-mass-distilled-runtime-preflight]', JSON.stringify(runtimePolicy))

    const deadlineMs = Date.now() + ROUTE_BUDGET_MS
    const runtimeWake = await wakeMassDistilledRuntime(claim.endpointId, deadlineMs)
    console.info('[cos-mass-distilled-runtime-wake]', JSON.stringify(runtimeWake))

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
    await recordProduction(true, {
      runnerInvoked: true,
      attempted: 1,
      status: 'completed',
      candidateId: claim.candidateId,
      artifactHash: claim.artifactHash,
      evaluationPassed: result.evaluationPassed,
      nextStatus: result.nextStatus,
      endpointCalls: result.endpointCalls,
      judgeCalls: result.judgeCalls,
    }).catch(() => undefined)
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
    await recordProduction(false, {
      runnerInvoked: Boolean(claim),
      error: clean(message, 500),
      ...(claim ? { candidateId: claim.candidateId, artifactHash: claim.artifactHash } : {}),
    }).catch(() => undefined)
    console.error('[cos-mass-distilled-independent-evaluation]', JSON.stringify({ ok: false, error: clean(message, 500) }))
    return NextResponse.json({ ok: false, error: clean(message, 500) }, { status: 500 })
  }
}