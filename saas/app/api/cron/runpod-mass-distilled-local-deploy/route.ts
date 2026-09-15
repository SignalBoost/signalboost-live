import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import {
  MASS_DISTILLED_CANARY_TIMEOUT_MS,
  MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,
  MASS_DISTILLED_STARTUP_READY_TIMEOUT_MS,
  canaryMassDistilledRuntime,
  massDistilledRuntimeSpec,
  provisionMassDistilledRuntime,
  reconcileMassDistilledRuntime,
  runpodServerlessEndpointHealth,
} from '@/lib/ai/cos/runpodServerlessMassDistilledProvision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PROFILE = 'cos_local_distilled_runtime_deploy_v1'
const APPROVAL_CLAIM = 'local_distilled_runtime_deploy_approved'
const SUSPEND_CLAIM = 'local_distilled_runtime_canary_suspended'
const STARTED_CLAIM = 'local_distilled_runtime_canary_started'
const MAX_CANARY_INVOCATIONS = 3
const MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD = 0.69
const MIN_BALANCE_USD = 1
const PAGE_SIZE = 100
const HF_MODEL_REF = /^hf:\/\/models\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([a-f0-9]{40})$/i

function clean(value: unknown, max = 2000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function conservativeCanaryCostUsd(): number {
  const seconds = MASS_DISTILLED_IDLE_TIMEOUT_SECONDS
    + MASS_DISTILLED_STARTUP_READY_TIMEOUT_MS / 1000
    + MASS_DISTILLED_CANARY_TIMEOUT_MS / 1000
  return Number((seconds * MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD / 3600).toFixed(6))
}

async function events(candidateId: string) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const rows = await db.from('cos_university_learning_assurance_events')
    .select('evidence,observed_at,expires_at,verifier')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', candidateId)
    .order('observed_at', { ascending: false })
    .limit(300)
  if (rows.error) throw rows.error
  return rows.data || []
}

function exactCanaryKey(candidateId: string, artifactHash: string): string {
  return `${candidateId}:${artifactHash.toLowerCase()}`
}

async function candidate() {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  let offset = 0

  while (true) {
    const artifacts = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,student_model_id,trained_artifact_id,trained_artifact_hash,evidence_ref,status,created_at')
      .eq('status', 'evaluation_pending')
      .like('candidate_id', 'mass:%')
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (artifacts.error) throw artifacts.error
    const page: any[] = artifacts.data || []
    if (!page.length) return null

    const candidateIds = [...new Set(page.map(row => clean(row.candidate_id, 140)).filter(Boolean))]
    const canaries = await db.from('cos_university_learning_assurance_events')
      .select('candidate_id,evidence')
      .eq('event_type', 'fine_tune')
      .eq('verifier', 'host_controller')
      .in('candidate_id', candidateIds)
      .contains('evidence', {
        profile: PROFILE,
        claim: 'local_distilled_runtime_canary_passed',
        exactArtifact: true,
        productionTrafficAuthorized: false,
      })
      .limit(Math.max(PAGE_SIZE * 5, candidateIds.length * 5))
    if (canaries.error) throw canaries.error
    const passed = new Set((canaries.data || []).map((row: any) => exactCanaryKey(
      clean(row.candidate_id, 140),
      clean(row.evidence?.artifactHash, 64),
    )))

    for (const artifact of page) {
      const candidateId = clean(artifact.candidate_id, 140)
      const artifactHash = clean(artifact.trained_artifact_hash, 64).toLowerCase()
      if (passed.has(exactCanaryKey(candidateId, artifactHash))) continue

      const run = await db.from('cos_university_mass_distillation_batch_runs')
        .select('student_model_revision,teacher_model_id,completed_at')
        .eq('candidate_id', candidateId)
        .eq('stage', 'complete')
        .maybeSingle()
      if (run.error) throw run.error
      if (!run.data) throw new Error('mass_distilled_runtime_training_run_missing')
      const ref = HF_MODEL_REF.exec(clean(artifact.evidence_ref, 2000))
      if (!ref || clean(ref[1], 240) !== clean(artifact.trained_artifact_id, 500)) {
        throw new Error('mass_distilled_runtime_adapter_ref_invalid')
      }
      const spec = massDistilledRuntimeSpec({
        candidateId,
        artifactHash,
        baseModelId: artifact.student_model_id,
        baseModelRevision: (run.data as any).student_model_revision,
        adapterModelId: artifact.trained_artifact_id,
        adapterModelRevision: ref[2],
      })
      return { artifact, run: run.data as any, spec, rows: await events(candidateId) }
    }

    if (page.length < PAGE_SIZE) return null
    offset += PAGE_SIZE
  }
}

function latestControl(rows: any[], artifactHash: string) {
  return rows.find(row => row?.verifier === 'host_controller'
    && row?.evidence?.profile === PROFILE
    && clean(row?.evidence?.artifactHash, 64).toLowerCase() === artifactHash
    && [APPROVAL_CLAIM, SUSPEND_CLAIM].includes(clean(row?.evidence?.claim, 80)))
}

function validApproval(rows: any[], artifactHash: string, now = new Date()) {
  const row = latestControl(rows, artifactHash)
  if (!row || row?.evidence?.claim !== APPROVAL_CLAIM) return null
  const observed = Date.parse(String(row.observed_at || ''))
  const expires = Date.parse(String(row.expires_at || ''))
  const evidence = row.evidence
  const approvedInvocations = Math.floor(Number(evidence?.maxCanaryInvocations || 0))
  const approvedCostUsd = Number(evidence?.maxEstimatedCanaryCostUsd || 0)
  return evidence?.canaryAuthorized === true
    && approvedInvocations > 0
    && approvedInvocations <= MAX_CANARY_INVOCATIONS
    && Number.isFinite(approvedCostUsd)
    && approvedCostUsd > 0
    && approvedCostUsd <= 0.2
    && evidence?.productionTrafficAuthorized === false
    && evidence?.authorityExpanded === false
    && Number.isFinite(observed) && observed <= now.getTime()
    && Number.isFinite(expires) && expires > now.getTime()
    ? { row, approvedInvocations, approvedCostUsd }
    : null
}

async function record(input: {
  candidateId: string
  subjectId: string
  artifactHash: string
  claim: string
  evidence: Record<string, unknown>
  expiresAt?: string | null
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const body = {
    profile: PROFILE,
    claim: input.claim,
    candidateId: input.candidateId,
    artifactHash: input.artifactHash,
    ...input.evidence,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  }
  const evidenceHash = hash(body)
  const eventKey = hash([PROFILE, input.claim, input.candidateId, input.artifactHash, evidenceHash])
  const inserted = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: input.subjectId,
    candidate_id: input.candidateId,
    evidence_hash: evidenceHash,
    evidence: body,
    verifier: 'host_controller',
    observed_at: new Date().toISOString(),
    expires_at: input.expiresAt || null,
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (inserted.error) throw inserted.error
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const selected = await candidate()
    if (!selected) return NextResponse.json({ ok: true, skipped: true, reason: 'no_mass_canary_pending_artifact' })
    const { artifact, spec, rows } = selected
    const candidateId = spec.candidateId
    const subjectId = clean((artifact as any).subject_id, 240)
    const artifactHash = spec.artifactHash
    const control = latestControl(rows, artifactHash)
    if (control?.evidence?.claim === SUSPEND_CLAIM) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'canary_suspended_by_host_controller', candidateId, artifactHash })
    }
    const approval = validApproval(rows, artifactHash)
    if (!approval) return NextResponse.json({ ok: true, skipped: true, reason: 'explicit_owner_approval_missing_or_expired', candidateId, artifactHash })
    const approvalObservedAt = String(approval.row.observed_at)
    const approvalFloor = Date.parse(approvalObservedAt)
    const estimatedCanaryCostUsd = conservativeCanaryCostUsd()
    if (estimatedCanaryCostUsd > approval.approvedCostUsd + 1e-9) {
      return NextResponse.json({
        ok: false,
        error: 'mass_distilled_canary_approved_budget_too_small',
        candidateId,
        artifactHash,
        approvedCostUsd: approval.approvedCostUsd,
        estimatedCanaryCostUsd,
      }, { status: 402 })
    }

    const account = await queryRunpodAccountStatus()
    if (account.clientBalance !== null && account.clientBalance < MIN_BALANCE_USD) {
      return NextResponse.json({ ok: false, error: 'runpod_balance_guard', balance: account.clientBalance }, { status: 402 })
    }

    const provisionedRow = rows.find(row => row?.evidence?.profile === PROFILE
      && row?.evidence?.claim === 'local_distilled_runtime_endpoint_provisioned'
      && clean(row?.evidence?.artifactHash, 64).toLowerCase() === artifactHash
      && clean(row?.evidence?.endpointName, 120) === spec.endpointName)
    let endpointId = clean(provisionedRow?.evidence?.endpointId, 120)
    if (!endpointId) {
      const provisioned = await provisionMassDistilledRuntime(spec)
      endpointId = provisioned.endpointId
      await record({
        candidateId, subjectId, artifactHash,
        claim: 'local_distilled_runtime_endpoint_provisioned',
        evidence: {
          endpointId,
          endpointName: spec.endpointName,
          templateName: spec.templateName,
          model: spec.modelName,
          baseModelId: spec.baseModelId,
          baseModelRevision: spec.baseModelRevision,
          adapterModelId: spec.adapterModelId,
          adapterModelRevision: spec.adapterModelRevision,
          routing: 'LOAD_BALANCER',
          workersMin: provisioned.workersMin,
          workersMax: provisioned.workersMax,
          idleTimeout: provisioned.idleTimeout,
          gpuTypes: provisioned.gpuTypes,
          createdTemplate: provisioned.createdTemplate,
          createdEndpoint: provisioned.createdEndpoint,
          scaleToZero: true,
          approvedCostUsd: approval.approvedCostUsd,
          estimatedCanaryCostUsd,
        },
      })
    } else {
      await reconcileMassDistilledRuntime(endpointId, spec)
    }

    const refreshed = await events(candidateId)
    const starts = refreshed.filter(row => row?.evidence?.profile === PROFILE
      && row?.evidence?.claim === STARTED_CLAIM
      && clean(row?.evidence?.artifactHash, 64).toLowerCase() === artifactHash
      && Date.parse(String(row?.observed_at || '')) >= approvalFloor).length
    const failures = refreshed.filter(row => row?.evidence?.profile === PROFILE
      && row?.evidence?.claim === 'local_distilled_runtime_canary_failed'
      && clean(row?.evidence?.artifactHash, 64).toLowerCase() === artifactHash
      && Date.parse(String(row?.observed_at || '')) >= approvalFloor).length
    const consumed = Math.max(starts, failures)
    if (consumed >= approval.approvedInvocations) {
      return NextResponse.json({
        ok: false,
        error: 'mass_distilled_canary_retry_ceiling',
        candidateId,
        artifactHash,
        endpointId,
        approvedInvocations: approval.approvedInvocations,
      }, { status: 503 })
    }

    const attemptOrdinal = consumed + 1
    await record({
      candidateId, subjectId, artifactHash,
      claim: STARTED_CLAIM,
      evidence: {
        endpointId,
        model: spec.modelName,
        attemptOrdinal,
        approvedInvocations: approval.approvedInvocations,
        approvedCostUsd: approval.approvedCostUsd,
        estimatedCanaryCostUsd,
        attemptTimeoutMs: MASS_DISTILLED_CANARY_TIMEOUT_MS,
        startupReadyTimeoutMs: MASS_DISTILLED_STARTUP_READY_TIMEOUT_MS,
        idleTimeoutSeconds: MASS_DISTILLED_IDLE_TIMEOUT_SECONDS,
        maxGpuHourlyCostUsd: MAX_SERVERLESS_GPU_PRICE_PER_HOUR_USD,
        authorizationObservedAt: approvalObservedAt,
      },
    })

    const healthBefore = await runpodServerlessEndpointHealth(endpointId)
    const canary = await canaryMassDistilledRuntime({ endpointId, spec })
    const healthAfter = await runpodServerlessEndpointHealth(endpointId)
    if (!canary.ok) {
      await record({
        candidateId, subjectId, artifactHash,
        claim: 'local_distilled_runtime_canary_failed',
        evidence: {
          endpointId,
          model: spec.modelName,
          attemptOrdinal,
          approvedInvocations: approval.approvedInvocations,
          approvedCostUsd: approval.approvedCostUsd,
          estimatedCanaryCostUsd,
          httpStatus: canary.httpStatus,
          error: clean(canary.error, 300),
          healthBefore,
          healthAfter,
          authorizationObservedAt: approvalObservedAt,
        },
      })
      return NextResponse.json({ ok: false, deployed: true, canaryPassed: false, candidateId, artifactHash, endpointId, error: canary.error, health: healthAfter }, { status: 503 })
    }

    const responseHash = hash(canary.text || '')
    await record({
      candidateId, subjectId, artifactHash,
      claim: 'local_distilled_runtime_canary_passed',
      evidence: {
        endpointId,
        model: spec.modelName,
        responseHash,
        exactArtifact: true,
        scaleToZero: true,
        httpStatus: canary.httpStatus,
        approvedCostUsd: approval.approvedCostUsd,
        estimatedCanaryCostUsd,
        healthBefore,
        healthAfter,
        authorizationObservedAt: approvalObservedAt,
      },
    })
    return NextResponse.json({ ok: true, deployed: true, canaryPassed: true, candidateId, artifactHash, endpointId, model: spec.modelName, productionTrafficAuthorized: false, health: healthAfter })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[runpod-mass-distilled-local-deploy]', JSON.stringify({ ok: false, error: message.slice(0, 500) }))
    return NextResponse.json({ ok: false, error: message.slice(0, 500) }, { status: 500 })
  }
}
