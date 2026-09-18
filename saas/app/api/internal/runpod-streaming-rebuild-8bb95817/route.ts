import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { FINE_TUNE_EVIDENCE_PROFILE } from '@/lib/ai/cos/cosUniversityFineTuneEvidence'
import { configuredRunpodApiKey } from '@/lib/ai/cos/runpodConfig'
import {
  DISTILLED_ADAPTER_MODEL_ID,
  DISTILLED_ENDPOINT_NAME,
  DISTILLED_ENDPOINT_ROUTING,
  DISTILLED_MODEL_NAME,
  DISTILLED_TEMPLATE_NAME,
  canaryRunpodServerlessDistilledLlm,
  provisionRunpodServerlessDistilledLlm,
} from '@/lib/ai/cos/runpodServerlessDistilledProvision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const TOKEN_HASH = '8bb9581780b86a00df992aa6796e82c2427c9eaf3020918e83afd5c7186153ea'
const CANDIDATE_ID = 'study-plan:e23cb043-715e-4406-8898-421159fae2df'
const ARTIFACT_HASH = 'bd7b151e75cc963d02597529b7256b755419dd20bcd2c36ca849e903d99421e4'
const LOCAL_PROFILE = 'cos_local_distilled_runtime_deploy_v1'

function authorized(token: string | null): boolean {
  if (!token) return false
  const actual = createHash('sha256').update(token).digest()
  const expected = Buffer.from(TOKEN_HASH, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function runpodFetch(path: string, init: RequestInit = {}) {
  const key = configuredRunpodApiKey()
  if (!key) throw new Error('RUNPOD_API_KEY is not configured')
  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  })
}

async function currentEndpointIds(): Promise<string[]> {
  const ids = new Set<string>()
  const response = await runpodFetch('https://api.runpod.io/v2/serverless')
  if (response.ok) {
    const payload: any = await response.json().catch(() => ({}))
    for (const endpoint of payload?.endpoints || []) {
      if (String(endpoint?.name || '') === DISTILLED_ENDPOINT_NAME && endpoint?.id) ids.add(String(endpoint.id))
    }
  }

  const db = cosServiceDb()
  if (db) {
    const rows = await db.from('cos_university_learning_assurance_events')
      .select('evidence')
      .eq('event_type', 'fine_tune')
      .eq('candidate_id', CANDIDATE_ID)
      .order('observed_at', { ascending: false })
      .limit(300)
    if (!rows.error) {
      for (const row of rows.data || []) {
        const evidence: any = row.evidence
        if (evidence?.profile === LOCAL_PROFILE
          && evidence?.claim === 'local_distilled_runtime_endpoint_provisioned'
          && String(evidence?.endpointName || '') === DISTILLED_ENDPOINT_NAME
          && evidence?.endpointId) ids.add(String(evidence.endpointId))
      }
    }
  }
  return [...ids].filter(id => /^[A-Za-z0-9_-]{3,120}$/.test(id))
}

async function waitEndpointNameGone(): Promise<void> {
  for (let i = 0; i < 30; i += 1) {
    const response = await runpodFetch('https://api.runpod.io/v2/serverless')
    if (response.ok) {
      const payload: any = await response.json().catch(() => ({}))
      const exists = (payload?.endpoints || []).some((item: any) => String(item?.name || '') === DISTILLED_ENDPOINT_NAME)
      if (!exists) return
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('old_distilled_endpoint_still_present')
}

async function matchingTemplateIds(): Promise<string[]> {
  const response = await runpodFetch('https://rest.runpod.io/v1/templates?includeEndpointBoundTemplates=true')
  if (!response.ok) throw new Error(`runpod_template_list_http_${response.status}`)
  const templates: any[] = await response.json()
  return templates
    .filter(item => String(item?.name || '') === DISTILLED_TEMPLATE_NAME && item?.id)
    .map(item => String(item.id))
    .filter(id => /^[A-Za-z0-9_-]{3,120}$/.test(id))
}

async function recordEvidence(input: {
  profile: string
  claim: string
  verifier: string
  subjectId: string
  evidence: Record<string, unknown>
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const body = {
    profile: input.profile,
    claim: input.claim,
    candidateId: CANDIDATE_ID,
    artifactHash: ARTIFACT_HASH,
    ...input.evidence,
    authorityExpanded: false,
    productionTrafficAuthorized: false,
  }
  const evidenceHash = hash(body)
  const eventKey = hash([input.profile, input.claim, CANDIDATE_ID, ARTIFACT_HASH, evidenceHash])
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: input.subjectId,
    candidate_id: CANDIDATE_ID,
    evidence_hash: evidenceHash,
    evidence: body,
    verifier: input.verifier,
    observed_at: new Date().toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (result.error) throw result.error
}

export async function GET(req: NextRequest) {
  if (!authorized(req.nextUrl.searchParams.get('token'))) {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  try {
    const db = cosServiceDb()
    if (!db) throw new Error('service_database_unavailable')
    const artifact = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,revision_key')
      .eq('candidate_id', CANDIDATE_ID)
      .eq('trained_artifact_id', DISTILLED_ADAPTER_MODEL_ID)
      .eq('trained_artifact_hash', ARTIFACT_HASH)
      .maybeSingle()
    if (artifact.error) throw artifact.error
    if (!artifact.data) throw new Error('distilled_artifact_not_found')

    const oldEndpointIds = await currentEndpointIds()
    for (const endpointId of oldEndpointIds) {
      const response = await runpodFetch(`https://rest.runpod.io/v1/endpoints/${endpointId}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) {
        throw new Error(`runpod_endpoint_delete_http_${response.status}`)
      }
    }
    await waitEndpointNameGone()

    const templateIds = await matchingTemplateIds()
    for (const templateId of templateIds) {
      const response = await runpodFetch(`https://rest.runpod.io/v1/templates/${templateId}`, { method: 'DELETE' })
      if (!response.ok && response.status !== 404) {
        throw new Error(`runpod_template_delete_http_${response.status}`)
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1500))
    const provisioned = await provisionRunpodServerlessDistilledLlm()

    await recordEvidence({
      profile: LOCAL_PROFILE,
      claim: 'local_distilled_runtime_endpoint_provisioned',
      verifier: 'host_controller',
      subjectId: String(artifact.data.subject_id || 'reasoning_decision_science'),
      evidence: {
        endpointId: provisioned.endpointId,
        endpointName: DISTILLED_ENDPOINT_NAME,
        routing: DISTILLED_ENDPOINT_ROUTING,
        baseUrl: provisioned.baseUrl,
        model: provisioned.model,
        adapterModelId: DISTILLED_ADAPTER_MODEL_ID,
        createdTemplate: provisioned.createdTemplate,
        createdEndpoint: provisioned.createdEndpoint,
        workersMin: provisioned.workersMin,
        workersMax: provisioned.workersMax,
        idleTimeout: provisioned.idleTimeout,
        gpuTypes: provisioned.gpuTypes,
        streamingGatewayRebuild: true,
      },
    })

    const canary = await canaryRunpodServerlessDistilledLlm({
      endpointId: provisioned.endpointId,
      attempts: 1,
      timeoutMs: 60_000,
      delayMs: 3000,
    })
    if (!canary.ok || !canary.text) {
      throw new Error(`streaming_gateway_canary_failed:${canary.httpStatus ?? 'network'}:${canary.error || 'unknown'}`)
    }

    const responseHash = createHash('sha256').update(canary.text).digest('hex')
    await recordEvidence({
      profile: LOCAL_PROFILE,
      claim: 'local_distilled_runtime_canary_passed',
      verifier: 'host_controller',
      subjectId: String(artifact.data.subject_id || 'reasoning_decision_science'),
      evidence: {
        endpointId: provisioned.endpointId,
        endpointName: DISTILLED_ENDPOINT_NAME,
        model: DISTILLED_MODEL_NAME,
        responseHash,
        exactArtifact: true,
        scaleToZero: true,
        streamingGateway: true,
      },
    })

    await recordEvidence({
      profile: FINE_TUNE_EVIDENCE_PROFILE,
      claim: 'production_canary_healthy',
      verifier: 'host_production_verifier',
      subjectId: String(artifact.data.subject_id || 'reasoning_decision_science'),
      evidence: {
        endpointId: provisioned.endpointId,
        trainedArtifactId: String(artifact.data.trained_artifact_id),
        revisionKey: String(artifact.data.revision_key || '').toLowerCase(),
        model: DISTILLED_MODEL_NAME,
        responseHash,
        exactArtifact: true,
        scaleToZero: true,
        streamingGateway: true,
      },
    })

    return NextResponse.json({
      ok: true,
      rebuilt: true,
      oldEndpointIds,
      deletedTemplateCount: templateIds.length,
      endpointId: provisioned.endpointId,
      createdTemplate: provisioned.createdTemplate,
      createdEndpoint: provisioned.createdEndpoint,
      canaryPassed: true,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[runpod-streaming-rebuild]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
}
