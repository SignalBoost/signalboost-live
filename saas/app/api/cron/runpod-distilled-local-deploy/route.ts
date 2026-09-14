// saas/app/api/cron/runpod-distilled-local-deploy/route.ts
import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { FINE_TUNE_EVIDENCE_PROFILE } from '@/lib/ai/cos/cosUniversityFineTuneEvidence'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import {
  DISTILLED_ADAPTER_MODEL_ID,
  DISTILLED_ADAPTER_MODEL_REVISION,
  DISTILLED_BASE_MODEL_ID,
  DISTILLED_BASE_MODEL_REVISION,
  DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS,
  DISTILLED_ENDPOINT_NAME,
  DISTILLED_ENDPOINT_ROUTING,
  DISTILLED_MODEL_NAME,
  canaryRunpodServerlessDistilledLlm,
  provisionRunpodServerlessDistilledLlm,
  reconcileRunpodServerlessDistilledEndpoint,
  runpodServerlessEndpointHealth,
} from '@/lib/ai/cos/runpodServerlessDistilledProvision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PROFILE = 'cos_local_distilled_runtime_deploy_v1'
const CANDIDATE_ID = 'study-plan:e23cb043-715e-4406-8898-421159fae2df'
const ARTIFACT_HASH = 'bd7b151e75cc963d02597529b7256b755419dd20bcd2c36ca849e903d99421e4'
const MIN_BALANCE_USD = 1
const MAX_CANARY_INVOCATIONS = 3
const CANARY_HTTP_ATTEMPTS_PER_INVOCATION = 2
const APPROVAL_CLAIM = 'local_distilled_runtime_deploy_approved'
const SUSPEND_CLAIM = 'local_distilled_runtime_canary_suspended'

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function events() {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events')
    .select('evidence,observed_at,expires_at,verifier')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', CANDIDATE_ID)
    .order('observed_at', { ascending: false })
    .limit(200)
  if (result.error) throw result.error
  return result.data || []
}

function matching(rows: any[], claim: string) {
  return rows.find(row => row?.evidence?.profile === PROFILE
    && row?.evidence?.claim === claim
    && row?.evidence?.artifactHash === ARTIFACT_HASH)
}

function matchingAfter(rows: any[], claim: string, notBefore: string) {
  const floor = Date.parse(notBefore)
  return rows.find(row => row?.evidence?.profile === PROFILE
    && row?.evidence?.claim === claim
    && row?.evidence?.artifactHash === ARTIFACT_HASH
    && Number.isFinite(Date.parse(String(row?.observed_at || '')))
    && Date.parse(String(row.observed_at)) >= floor)
}

/**
 * The assurance ledger is append-only. Therefore a newer host-controller suspension must override
 * an older approval without mutating history. A still newer approval can explicitly resume canaries.
 */
function latestCanaryControl(rows: any[]) {
  return rows.find(row => row?.verifier === 'host_controller'
    && row?.evidence?.profile === PROFILE
    && row?.evidence?.artifactHash === ARTIFACT_HASH
    && [APPROVAL_CLAIM, SUSPEND_CLAIM].includes(String(row?.evidence?.claim || '')))
}

function validApproval(rows: any[], now = new Date()) {
  const row = latestCanaryControl(rows)
  if (!row || row?.evidence?.claim !== APPROVAL_CLAIM) return null
  const evidence = row.evidence
  const observedAt = Date.parse(String(row.observed_at || ''))
  const expiresAt = Date.parse(String(row.expires_at || ''))
  const nowMs = now.getTime()
  return evidence?.canaryAuthorized === true
    && Number(evidence?.maxCanaryInvocations || MAX_CANARY_INVOCATIONS) <= MAX_CANARY_INVOCATIONS
    && Number(evidence?.maxEstimatedCanaryCostUsd || 0) <= 0.2
    && evidence?.productionTrafficAuthorized === false
    && evidence?.authorityExpanded === false
    && Number.isFinite(observedAt)
    && Number.isFinite(expiresAt)
    && observedAt <= nowMs
    && expiresAt > nowMs
    ? row
    : null
}

async function record(claim: string, evidence: Record<string, unknown>, verifier = 'host_controller') {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const body = {
    profile: PROFILE,
    claim,
    candidateId: CANDIDATE_ID,
    artifactHash: ARTIFACT_HASH,
    ...evidence,
    authorityExpanded: false,
  }
  const evidenceHash = hash(body)
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: hash([PROFILE, claim, CANDIDATE_ID, ARTIFACT_HASH, evidenceHash]),
    event_type: 'fine_tune',
    subject_id: 'reasoning_decision_science',
    candidate_id: CANDIDATE_ID,
    evidence_hash: evidenceHash,
    evidence: body,
    verifier,
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
  return evidenceHash
}

async function recordProductionCanaryEvidence(rows: any[], endpointId: string, responseHash: string) {
  const trained = rows.find(row => row?.verifier === 'training_executor'
    && row?.evidence?.profile === FINE_TUNE_EVIDENCE_PROFILE
    && row?.evidence?.claim === 'trained_artifact_registered'
    && row?.evidence?.artifactHash === ARTIFACT_HASH)
  const trainedArtifactId = String(trained?.evidence?.trainedArtifactId || '').trim()
  const revisionKey = String(trained?.evidence?.revisionKey || '').trim().toLowerCase()
  if (!trainedArtifactId || !/^[a-f0-9]{64}$/.test(revisionKey)) {
    throw new Error('distilled_canary_training_binding_missing')
  }
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const evidence = {
    profile: FINE_TUNE_EVIDENCE_PROFILE,
    claim: 'production_canary_healthy',
    candidateId: CANDIDATE_ID,
    revisionKey,
    trainedArtifactId,
    artifactHash: ARTIFACT_HASH,
    evidenceRef: `db://cos_university_learning_assurance_events/${hash(['distilled-production-canary', endpointId, responseHash])}`,
    endpointId,
    model: DISTILLED_MODEL_NAME,
    responseHash,
    exactArtifact: true,
    scaleToZero: true,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  }
  const evidenceHash = hash(evidence)
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: hash([FINE_TUNE_EVIDENCE_PROFILE, 'production_canary_healthy', CANDIDATE_ID, ARTIFACT_HASH, endpointId, responseHash]),
    event_type: 'fine_tune',
    subject_id: 'reasoning_decision_science',
    candidate_id: CANDIDATE_ID,
    evidence_hash: evidenceHash,
    evidence,
    verifier: 'host_production_verifier',
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await events()
    const control = latestCanaryControl(rows)
    if (control?.evidence?.claim === SUSPEND_CLAIM) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'canary_suspended_by_host_controller' })
    }
    const approval = validApproval(rows)
    if (!approval) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'explicit_owner_approval_missing_or_expired' })
    }
    const approvalObservedAt = String(approval.observed_at)

    const passed = matchingAfter(rows, 'local_distilled_runtime_canary_passed', approvalObservedAt)
    if (passed) {
      return NextResponse.json({
        ok: true,
        deployed: true,
        canaryPassed: true,
        endpointId: passed.evidence.endpointId,
        model: DISTILLED_MODEL_NAME,
      })
    }

    const account = await queryRunpodAccountStatus()
    if (account.clientBalance !== null && account.clientBalance < MIN_BALANCE_USD) {
      return NextResponse.json({ ok: false, error: 'runpod_balance_guard', balance: account.clientBalance }, { status: 402 })
    }

    // Endpoint evidence is bound to the endpoint NAME as well as the artifact: a previously
    // provisioned endpoint built under a different routing mode must never be reused silently.
    const provisionedRow = rows.find(row => row?.evidence?.profile === PROFILE
      && row?.evidence?.claim === 'local_distilled_runtime_endpoint_provisioned'
      && row?.evidence?.artifactHash === ARTIFACT_HASH
      && String(row?.evidence?.endpointName || '') === DISTILLED_ENDPOINT_NAME
      && String(row?.evidence?.routing || '') === DISTILLED_ENDPOINT_ROUTING)
    let endpointId = String(provisionedRow?.evidence?.endpointId || '').trim()
    if (!endpointId) {
      const provisioned = await provisionRunpodServerlessDistilledLlm()
      endpointId = provisioned.endpointId
      await record('local_distilled_runtime_endpoint_provisioned', {
        endpointId,
        endpointName: DISTILLED_ENDPOINT_NAME,
        routing: DISTILLED_ENDPOINT_ROUTING,
        baseUrl: provisioned.baseUrl,
        model: provisioned.model,
        baseModelId: DISTILLED_BASE_MODEL_ID,
        baseModelRevision: DISTILLED_BASE_MODEL_REVISION,
        adapterModelId: DISTILLED_ADAPTER_MODEL_ID,
        adapterModelRevision: DISTILLED_ADAPTER_MODEL_REVISION,
        workersMin: provisioned.workersMin,
        workersMax: provisioned.workersMax,
        idleTimeout: provisioned.idleTimeout,
        gpuTypes: provisioned.gpuTypes,
        createdTemplate: provisioned.createdTemplate,
        createdEndpoint: provisioned.createdEndpoint,
        scaleToZero: provisioned.workersMin === 0,
      })
    } else {
      await reconcileRunpodServerlessDistilledEndpoint(endpointId)
    }

    const refreshed = await events()
    const approvalFloor = Date.parse(approvalObservedAt)
    const failures = refreshed.filter(row => row?.evidence?.profile === PROFILE
      && row?.evidence?.claim === 'local_distilled_runtime_canary_failed'
      && row?.evidence?.artifactHash === ARTIFACT_HASH
      && Date.parse(String(row?.observed_at || '')) >= approvalFloor).length
    if (failures >= MAX_CANARY_INVOCATIONS) {
      return NextResponse.json({ ok: false, error: 'distilled_canary_retry_ceiling', endpointId }, { status: 503 })
    }

    const healthBefore = await runpodServerlessEndpointHealth(endpointId)
    const canary = await canaryRunpodServerlessDistilledLlm({
      endpointId,
      attempts: CANARY_HTTP_ATTEMPTS_PER_INVOCATION,
      delayMs: 5000,
      timeoutMs: DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS,
    })
    if (!canary.ok) {
      const healthAfter = await runpodServerlessEndpointHealth(endpointId)
      await record('local_distilled_runtime_canary_failed', {
        endpointId,
        model: canary.model,
        httpStatus: canary.httpStatus,
        error: canary.error,
        attemptOrdinal: failures + 1,
        httpAttempts: CANARY_HTTP_ATTEMPTS_PER_INVOCATION,
        attemptTimeoutMs: DISTILLED_CANARY_ATTEMPT_TIMEOUT_MS,
        healthBefore,
        healthAfter,
        authorizationObservedAt: approvalObservedAt,
      })
      return NextResponse.json({
        ok: false,
        deployed: true,
        canaryPassed: false,
        endpointId,
        error: canary.error,
        health: healthAfter,
      }, { status: 503 })
    }

    const responseHash = hash(canary.text || '')
    const healthAfter = await runpodServerlessEndpointHealth(endpointId)
    await record('local_distilled_runtime_canary_passed', {
      endpointId,
      model: canary.model,
      httpStatus: canary.httpStatus,
      responseHash,
      exactArtifact: true,
      scaleToZero: true,
      productionTrafficAuthorized: false,
      httpAttemptsCeiling: CANARY_HTTP_ATTEMPTS_PER_INVOCATION,
      healthBefore,
      healthAfter,
      authorizationObservedAt: approvalObservedAt,
    })
    await recordProductionCanaryEvidence(await events(), endpointId, responseHash)

    return NextResponse.json({
      ok: true,
      deployed: true,
      canaryPassed: true,
      endpointId,
      model: canary.model,
      productionTrafficAuthorized: false,
      health: healthAfter,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[runpod-distilled-local-deploy]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
