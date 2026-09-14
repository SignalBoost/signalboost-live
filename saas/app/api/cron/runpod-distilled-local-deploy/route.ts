import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { queryRunpodAccountStatus } from '@/lib/hub/runpodTelemetry'
import {
  DISTILLED_ADAPTER_MODEL_ID,
  DISTILLED_ADAPTER_MODEL_REVISION,
  DISTILLED_BASE_MODEL_ID,
  DISTILLED_BASE_MODEL_REVISION,
  DISTILLED_MODEL_NAME,
  canaryRunpodServerlessDistilledLlm,
  provisionRunpodServerlessDistilledLlm,
} from '@/lib/ai/cos/runpodServerlessDistilledProvision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PROFILE = 'cos_local_distilled_runtime_deploy_v1'
const CANDIDATE_ID = 'study-plan:e23cb043-715e-4406-8898-421159fae2df'
const ARTIFACT_HASH = 'bd7b151e75cc963d02597529b7256b755419dd20bcd2c36ca849e903d99421e4'
const MIN_BALANCE_USD = 1
const MAX_CANARY_INVOCATIONS = 3

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function events() {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events')
    .select('evidence,observed_at,verifier')
    .eq('event_type', 'fine_tune')
    .eq('candidate_id', CANDIDATE_ID)
    .order('observed_at', { ascending: false })
    .limit(100)
  if (result.error) throw result.error
  return result.data || []
}

function matching(rows: any[], claim: string) {
  return rows.find(row => row?.evidence?.profile === PROFILE
    && row?.evidence?.claim === claim
    && row?.evidence?.artifactHash === ARTIFACT_HASH)
}

async function record(claim: string, evidence: Record<string, unknown>) {
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

  try {
    const rows = await events()
    const approval = matching(rows, 'local_distilled_runtime_deploy_approved')
    if (!approval || approval?.evidence?.canaryAuthorized !== true) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'explicit_owner_approval_missing' })
    }

    const passed = matching(rows, 'local_distilled_runtime_canary_passed')
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

    let endpointId = String(matching(rows, 'local_distilled_runtime_endpoint_provisioned')?.evidence?.endpointId || '').trim()
    if (!endpointId) {
      const provisioned = await provisionRunpodServerlessDistilledLlm()
      endpointId = provisioned.endpointId
      await record('local_distilled_runtime_endpoint_provisioned', {
        endpointId,
        baseUrl: provisioned.baseUrl,
        model: provisioned.model,
        baseModelId: DISTILLED_BASE_MODEL_ID,
        baseModelRevision: DISTILLED_BASE_MODEL_REVISION,
        adapterModelId: DISTILLED_ADAPTER_MODEL_ID,
        adapterModelRevision: DISTILLED_ADAPTER_MODEL_REVISION,
        workersMin: provisioned.workersMin,
        workersMax: provisioned.workersMax,
        gpuTypes: provisioned.gpuTypes,
        createdTemplate: provisioned.createdTemplate,
        createdEndpoint: provisioned.createdEndpoint,
        scaleToZero: provisioned.workersMin === 0,
      })
    }

    const refreshed = await events()
    const failures = refreshed.filter(row => row?.evidence?.profile === PROFILE
      && row?.evidence?.claim === 'local_distilled_runtime_canary_failed'
      && row?.evidence?.artifactHash === ARTIFACT_HASH).length
    if (failures >= MAX_CANARY_INVOCATIONS) {
      return NextResponse.json({ ok: false, error: 'distilled_canary_retry_ceiling', endpointId }, { status: 503 })
    }

    const canary = await canaryRunpodServerlessDistilledLlm({ endpointId, attempts: 8, delayMs: 8000 })
    if (!canary.ok) {
      await record('local_distilled_runtime_canary_failed', {
        endpointId,
        model: canary.model,
        httpStatus: canary.httpStatus,
        error: canary.error,
        attemptOrdinal: failures + 1,
      })
      return NextResponse.json({ ok: false, deployed: true, canaryPassed: false, endpointId, error: canary.error }, { status: 503 })
    }

    await record('local_distilled_runtime_canary_passed', {
      endpointId,
      model: canary.model,
      httpStatus: canary.httpStatus,
      responseHash: hash(canary.text || ''),
      exactArtifact: true,
      scaleToZero: true,
      productionTrafficAuthorized: false,
    })

    return NextResponse.json({
      ok: true,
      deployed: true,
      canaryPassed: true,
      endpointId,
      model: canary.model,
      productionTrafficAuthorized: false,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[runpod-distilled-local-deploy]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
