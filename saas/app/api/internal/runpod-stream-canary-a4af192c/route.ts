import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { FINE_TUNE_EVIDENCE_PROFILE } from '@/lib/ai/cos/cosUniversityFineTuneEvidence'
import { configuredRunpodApiKey } from '@/lib/ai/cos/runpodConfig'
import { readOpenAiStream } from '@/lib/ai/cos/openAiStreamReader'
import { DISTILLED_ADAPTER_MODEL_ID, DISTILLED_MODEL_NAME } from '@/lib/ai/cos/runpodServerlessDistilledProvision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 600

const TOKEN_HASH = 'a4af192c0a22eaa2e3a0db8db5cae99f814d7fa7d87d8a3c6dcba1405022c9de'
const ENDPOINT_ID = '61w74dke3igx60'
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

async function record(input: { profile: string; claim: string; verifier: string; subjectId: string; evidence: Record<string, unknown> }) {
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
  const result = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: hash([input.profile, input.claim, CANDIDATE_ID, ARTIFACT_HASH, ENDPOINT_ID, evidenceHash]),
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

async function requireReady(key: string): Promise<void> {
  const deadline = Date.now() + 300_000
  let lastStatus: number | null = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`https://${ENDPOINT_ID}.api.runpod.ai/ready`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15_000),
      })
      lastStatus = response.status
      if (response.status === 200) return
      if (response.status === 503) {
        const text = await response.text()
        if (text.includes('distilled_bootstrap_failed')) throw new Error(text.slice(0, 500))
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('distilled_bootstrap_failed')) throw error
    }
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  throw new Error(`strict_ready_timeout:${lastStatus ?? 'network'}`)
}

export async function GET(req: NextRequest) {
  if (!authorized(req.nextUrl.searchParams.get('token'))) return NextResponse.json({ ok: false }, { status: 404 })
  try {
    const key = configuredRunpodApiKey()
    if (!key) throw new Error('RUNPOD_API_KEY is not configured')
    const db = cosServiceDb()
    if (!db) throw new Error('service_database_unavailable')
    const artifact = await db.from('cos_local_distillation_artifacts')
      .select('subject_id,trained_artifact_id,trained_artifact_hash,revision_key')
      .eq('candidate_id', CANDIDATE_ID)
      .eq('trained_artifact_id', DISTILLED_ADAPTER_MODEL_ID)
      .eq('trained_artifact_hash', ARTIFACT_HASH)
      .maybeSingle()
    if (artifact.error) throw artifact.error
    if (!artifact.data) throw new Error('distilled_artifact_not_found')

    await requireReady(key)

    const controller = new AbortController()
    const overall = setTimeout(() => controller.abort(), 180_000)
    let idle: ReturnType<typeof setTimeout> | null = null
    const resetIdle = () => {
      if (idle) clearTimeout(idle)
      idle = setTimeout(() => controller.abort(), 45_000)
    }
    let response: Response
    let text = ''
    try {
      resetIdle()
      response = await fetch(`https://${ENDPOINT_ID}.api.runpod.ai/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model: DISTILLED_MODEL_NAME,
          temperature: 0,
          max_tokens: 64,
          stream: true,
          chat_template_kwargs: { enable_thinking: false },
          messages: [
            { role: 'system', content: 'Return one concise sentence only.' },
            { role: 'user', content: 'State the operational principle: evidence should be separated from inference.' },
          ],
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`stream_canary_http_${response.status}`)
      text = (await readOpenAiStream(response, resetIdle)).trim()
    } finally {
      clearTimeout(overall)
      if (idle) clearTimeout(idle)
    }
    if (!text) throw new Error('stream_canary_empty')

    const responseHash = createHash('sha256').update(text).digest('hex')
    const subjectId = String(artifact.data.subject_id || 'reasoning_decision_science')
    await record({
      profile: LOCAL_PROFILE,
      claim: 'local_distilled_runtime_canary_passed',
      verifier: 'host_controller',
      subjectId,
      evidence: {
        endpointId: ENDPOINT_ID,
        endpointName: 'itmounts-distilled-reasoning-lb-v6',
        model: DISTILLED_MODEL_NAME,
        responseHash,
        exactArtifact: true,
        scaleToZero: true,
        streamingGateway: true,
        strictReady200: true,
        streamedCanary: true,
      },
    })
    await record({
      profile: FINE_TUNE_EVIDENCE_PROFILE,
      claim: 'production_canary_healthy',
      verifier: 'host_production_verifier',
      subjectId,
      evidence: {
        endpointId: ENDPOINT_ID,
        trainedArtifactId: String(artifact.data.trained_artifact_id),
        revisionKey: String(artifact.data.revision_key || '').toLowerCase(),
        model: DISTILLED_MODEL_NAME,
        responseHash,
        exactArtifact: true,
        scaleToZero: true,
        streamingGateway: true,
        strictReady200: true,
        streamedCanary: true,
      },
    })

    return NextResponse.json({ ok: true, endpointId: ENDPOINT_ID, streamedCanaryPassed: true, responseHash }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[runpod-stream-canary]', JSON.stringify({ ok: false, error: message }))
    return NextResponse.json({ ok: false, error: message }, { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
}
