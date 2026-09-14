import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const COS_UNIVERSITY_GRADUATE_RUNTIME_PROFILE = 'cos_university_graduate_runtime_v1' as const

const HEX64 = /^[a-f0-9]{64}$/i
const CANARY_TOKEN = 'ITMOUNTS_GRADUATE_CANARY_OK'

function clean(value: unknown, max = 1000): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function hosts(value: string | undefined): Set<string> {
  return new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean))
}

function timeoutMs(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1_000, Math.min(120_000, Math.floor(parsed))) : 20_000
}

export type GraduateRuntimeConfig = Readonly<{
  baseUrl: string
  provider: string
  model: string
  artifactId: string
  artifactHash: string
  apiKey: string
  timeoutMs: number
}>

/**
 * Host configuration binds a serving endpoint to the exact immutable trained artifact. Configuration
 * alone never activates it; `/models` health moves pending_runtime -> canary and an exact no-fallback
 * inference canary moves canary -> active.
 */
export function graduateRuntimeConfigFromEnv(): GraduateRuntimeConfig | null {
  const rawUrl = clean(process.env.COS_GRADUATE_AI_BASE_URL, 2000)
  const model = clean(process.env.COS_GRADUATE_AI_MODEL, 300)
  const artifactId = clean(process.env.COS_GRADUATE_AI_ARTIFACT_ID, 500)
  const artifactHash = clean(process.env.COS_GRADUATE_AI_ARTIFACT_HASH, 64).toLowerCase()
  const apiKey = clean(process.env.COS_GRADUATE_AI_API_KEY || process.env.HF_TOKEN, 4096)
  if (!rawUrl || !model || !artifactId || !HEX64.test(artifactHash) || !apiKey) return null
  let url: URL
  try { url = new URL(rawUrl) } catch { return null }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null
  const allowed = hosts(process.env.COS_GRADUATE_AI_ALLOWED_HOSTS)
  if (!allowed.has(url.hostname.toLowerCase())) return null
  const provider = clean(process.env.COS_GRADUATE_AI_PROVIDER, 80).toLowerCase()
    || (url.hostname.toLowerCase().includes('huggingface') ? 'huggingface' : url.hostname.toLowerCase())
  return Object.freeze({
    baseUrl: url.toString().replace(/\/$/, ''),
    provider,
    model,
    artifactId,
    artifactHash,
    apiKey,
    timeoutMs: timeoutMs(process.env.COS_GRADUATE_AI_TIMEOUT_MS),
  })
}

export function graduateRuntimeReadiness() {
  const config = graduateRuntimeConfigFromEnv()
  return Object.freeze({
    configured: Boolean(config),
    provider: config?.provider || null,
    model: config?.model || null,
    artifactId: config?.artifactId || null,
    artifactHash: config?.artifactHash || null,
    endpointOrigin: config ? new URL(config.baseUrl).origin : null,
    semantics: 'exact_artifact_binding_health_then_no_fallback_canary',
  })
}

async function exactRegistryRow(config: GraduateRuntimeConfig) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_graduate_model_registry')
    .select('id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,status,runtime_profile,runtime_provider,runtime_model_id,runtime_health_evidence_hash,activation_evidence_hash,rollback_artifact_ref,authority_expanded')
    .eq('trained_artifact_id', config.artifactId)
    .eq('trained_artifact_hash', config.artifactHash)
    .eq('authority_expanded', false)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error('graduate_runtime_registry_artifact_not_found')
  return result.data as any
}

async function recordRuntimeEvidence(input: {
  candidateId: string
  subjectId: string
  claim: 'graduate_runtime_health_verified' | 'graduate_runtime_canary_healthy'
  evidence: Record<string, unknown>
  verifier?: 'host_controller' | 'host_production_verifier'
}) {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const now = new Date().toISOString()
  const evidence = {
    profile: COS_UNIVERSITY_GRADUATE_RUNTIME_PROFILE,
    claim: input.claim,
    candidateId: input.candidateId,
    ...input.evidence,
    authorityExpanded: false,
  }
  const evidenceHash = hash(evidence)
  const eventKey = hash([COS_UNIVERSITY_GRADUATE_RUNTIME_PROFILE, input.claim, input.candidateId, evidenceHash])
  const inserted = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey,
    event_type: 'fine_tune',
    subject_id: input.subjectId,
    candidate_id: input.candidateId,
    evidence_hash: evidenceHash,
    evidence,
    verifier: input.verifier || 'host_production_verifier',
    observed_at: now,
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (inserted.error) throw inserted.error
  return { evidenceHash, eventKey, observedAt: now }
}

async function modelsHealth(config: GraduateRuntimeConfig): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 10_000))
  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}`, 'x-api-key': config.apiKey },
      signal: controller.signal,
      redirect: 'error',
    })
    if (!response.ok) return false
    const payload = await response.json() as { data?: Array<{ id?: string }> }
    return Array.isArray(payload.data) && payload.data.some(item => clean(item?.id, 300) === config.model)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function bindConfiguredGraduateRuntime() {
  const config = graduateRuntimeConfigFromEnv()
  if (!config) return { configured: false as const, bound: false as const, reason: 'graduate_runtime_not_configured' }
  const row = await exactRegistryRow(config)
  if (!['pending_runtime', 'canary'].includes(String(row.status))) {
    return { configured: true as const, bound: false as const, reason: `graduate_runtime_status_${String(row.status)}` }
  }
  const healthy = await modelsHealth(config)
  if (!healthy) return { configured: true as const, bound: false as const, reason: 'graduate_runtime_model_health_failed' }

  const health = await recordRuntimeEvidence({
    candidateId: row.candidate_id,
    subjectId: row.subject_id,
    claim: 'graduate_runtime_health_verified',
    evidence: {
      artifactId: config.artifactId,
      artifactHash: config.artifactHash,
      runtimeProfile: 'graduate_ai',
      runtimeProvider: config.provider,
      runtimeModelId: config.model,
      endpointOrigin: new URL(config.baseUrl).origin,
    },
  })
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const updated = await db.from('cos_university_graduate_model_registry').update({
    status: 'canary',
    runtime_profile: 'graduate_ai',
    runtime_provider: config.provider,
    runtime_model_id: config.model,
    runtime_health_evidence_hash: health.evidenceHash,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id).eq('trained_artifact_hash', config.artifactHash).eq('authority_expanded', false)
  if (updated.error) throw updated.error
  return {
    configured: true as const,
    bound: true as const,
    candidateId: row.candidate_id,
    artifactId: config.artifactId,
    model: config.model,
    provider: config.provider,
    status: 'canary' as const,
    healthEvidenceHash: health.evidenceHash,
  }
}

async function noFallbackCanary(config: GraduateRuntimeConfig): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        'x-api-key': config.apiKey,
      },
      signal: controller.signal,
      redirect: 'error',
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 16,
        messages: [
          { role: 'system', content: `Return exactly ${CANARY_TOKEN} and nothing else.` },
          { role: 'user', content: `Return exactly ${CANARY_TOKEN}.` },
        ],
      }),
    })
    if (!response.ok) return false
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    return clean(payload.choices?.[0]?.message?.content, 100) === CANARY_TOKEN
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Cost-bearing only because it performs one tiny inference against an already provisioned endpoint.
 * Callers must apply their normal owner approval boundary before invoking this operation. There is no
 * fallback: success proves the configured graduate itself answered.
 */
export async function activateConfiguredGraduateRuntimeCanary() {
  const config = graduateRuntimeConfigFromEnv()
  if (!config) return { configured: false as const, activated: false as const, reason: 'graduate_runtime_not_configured' }
  const row = await exactRegistryRow(config)
  if (row.status !== 'canary'
    || row.runtime_profile !== 'graduate_ai'
    || row.runtime_provider !== config.provider
    || row.runtime_model_id !== config.model
    || !HEX64.test(clean(row.runtime_health_evidence_hash, 64))) {
    return { configured: true as const, activated: false as const, reason: 'graduate_runtime_not_bound_for_canary' }
  }
  const passed = await noFallbackCanary(config)
  if (!passed) return { configured: true as const, activated: false as const, reason: 'graduate_runtime_canary_failed' }

  const canary = await recordRuntimeEvidence({
    candidateId: row.candidate_id,
    subjectId: row.subject_id,
    claim: 'graduate_runtime_canary_healthy',
    evidence: {
      artifactId: config.artifactId,
      artifactHash: config.artifactHash,
      runtimeProfile: 'graduate_ai',
      runtimeProvider: config.provider,
      runtimeModelId: config.model,
      runtimeHealthEvidenceHash: row.runtime_health_evidence_hash,
      canaryTokenHash: hash(CANARY_TOKEN),
    },
  })
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const activatedAt = new Date().toISOString()
  const updated = await db.from('cos_university_graduate_model_registry').update({
    status: 'active',
    activation_evidence_hash: canary.evidenceHash,
    activated_at: activatedAt,
    updated_at: activatedAt,
  }).eq('id', row.id).eq('status', 'canary').eq('trained_artifact_hash', config.artifactHash).eq('authority_expanded', false)
  if (updated.error) throw updated.error
  return {
    configured: true as const,
    activated: true as const,
    candidateId: row.candidate_id,
    artifactId: config.artifactId,
    model: config.model,
    provider: config.provider,
    status: 'active' as const,
    activationEvidenceHash: canary.evidenceHash,
  }
}
