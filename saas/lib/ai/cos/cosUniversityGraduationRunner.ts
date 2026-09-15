// saas/lib/ai/cos/cosUniversityGraduateRuntime.ts
import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  checkLocalInferenceHealth,
  localInferenceConfigFromEnv,
  type LocalInferenceConfig,
} from '@/lib/ai/local-inference'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import { classifyInferenceHost } from '@/lib/ai/cos/reasonerHostingDisclosure'
import type { CosReasonerConfig } from '@/lib/ai/cos/cosReasoner'
import type { CosReasoningWorkerRole } from '@/lib/ai/cos/cosReasoningControlPlane'

export const COS_UNIVERSITY_GRADUATE_RUNTIME_VERSION = 'cos-university-graduate-runtime-v1' as const

export type GraduateRuntimeProfile = 'local_ai' | 'graduate_ai'

export type ActiveGraduateRuntime = Readonly<{
  registryId: string
  candidateId: string
  subjectId: string
  trainedArtifactId: string
  trainedArtifactHash: string
  runtimeProfile: GraduateRuntimeProfile
  runtimeProvider: string
  runtimeModelId: string
  workerRole: CosReasoningWorkerRole
  problemClass: string
  inference: LocalInferenceConfig
  reasoner: CosReasonerConfig
}>

export type GraduateRuntimeBindingInput = Readonly<{
  candidateId: string
  trainedArtifactHash: string
  runtimeProfile: GraduateRuntimeProfile
  runtimeModelId: string
  workerRoles: readonly CosReasoningWorkerRole[]
  problemClasses: readonly string[]
  now: Date
}>

const HEX64 = /^[a-f0-9]{64}$/i
const ROLES = new Set<CosReasoningWorkerRole>(['primary', 'coder', 'critic', 'verifier', 'researcher'])

function clean(value: unknown, limit = 500): string {
  return String(value ?? '').trim().slice(0, limit)
}

function uniqueStrings(values: readonly unknown[], limit: number): string[] {
  return [...new Set(values.map(value => clean(value, limit)).filter(Boolean))]
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizeProvider(value: unknown): string {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
}

function graduateManagedConfig(model: string): { inference: LocalInferenceConfig; provider: string; reasoner: CosReasonerConfig } {
  const baseUrlRaw = clean(process.env.COS_GRADUATE_AI_BASE_URL, 2000)
  if (!baseUrlRaw) throw new Error('graduate_runtime_base_url_not_configured')
  const url = new URL(baseUrlRaw)
  const host = url.hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
  const classification = classifyInferenceHost(baseUrlRaw)
  const apiKey = clean(process.env.COS_GRADUATE_AI_API_KEY, 4000) || undefined

  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('graduate_runtime_invalid_protocol')
  if (!classification.selfHosted) {
    const allowedHosts = new Set(
      String(process.env.COS_GRADUATE_AI_ALLOWED_HOSTS || '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean),
    )
    if (!allowedHosts.has(host)) throw new Error('graduate_runtime_host_not_allowed')
    if (url.protocol !== 'https:') throw new Error('graduate_runtime_remote_https_required')
    if (!apiKey) throw new Error('graduate_runtime_api_key_required')
  }
  if (url.username || url.password) throw new Error('graduate_runtime_embedded_credentials_forbidden')

  const timeoutValue = Number(process.env.COS_GRADUATE_AI_TIMEOUT_MS || process.env.LOCAL_AI_TIMEOUT_MS || '120000')
  if (!Number.isFinite(timeoutValue) || timeoutValue < 1000 || timeoutValue > 600000) {
    throw new Error('graduate_runtime_timeout_invalid')
  }

  const provider = classification.selfHosted
    ? 'self_hosted'
    : normalizeProvider(process.env.COS_GRADUATE_AI_MANAGED_PROVIDER) || classification.provider || 'managed-open-model'
  const baseUrl = url.toString().replace(/\/$/, '')
  const inference: LocalInferenceConfig = { baseUrl, model, apiKey, timeoutMs: timeoutValue, provider }
  const reasoner: CosReasonerConfig = classification.selfHosted
    ? { kind: 'independent-local', label: `independent-local:${model}` }
    : { kind: 'managed-open-model', label: `managed-open-model:${provider}:${model}` }
  return { inference, provider, reasoner }
}

export function resolveGraduateRuntimeProfile(profile: GraduateRuntimeProfile, modelInput: string) {
  const model = clean(modelInput, 240)
  if (!model) throw new Error('graduate_runtime_model_missing')

  if (profile === 'local_ai') {
    const base = localInferenceConfigFromEnv()
    const classification = classifyInferenceHost(base.baseUrl)
    const provider = classification.selfHosted
      ? 'self_hosted'
      : normalizeProvider(process.env.LOCAL_AI_MANAGED_PROVIDER) || classification.provider || 'managed-open-model'
    const inference: LocalInferenceConfig = { ...base, model, provider }
    const reasoner: CosReasonerConfig = classification.selfHosted
      ? { kind: 'independent-local', label: `independent-local:${model}` }
      : { kind: 'managed-open-model', label: `managed-open-model:${provider}:${model}` }
    return { inference, provider, reasoner }
  }

  return graduateManagedConfig(model)
}

/**
 * Bounded wait for a scale-to-zero graduate runtime to prove the exact served identity.
 * Standard OpenAI-compatible servers are proven by `GET <base>/models` listing the model. A runtime
 * behind the iTMounts serving gateway exposes no `/models` route (HTTP 404); it is proven instead
 * by the gateway's own readiness contract `GET <origin>/ready` = 200 `{ ready: true, model }`,
 * which it only returns after its internal vLLM is healthy with that exact adapter loaded.
 * A cold worker answers 204 / times out while booting, so this polls within the caller's budget.
 */
export const GRADUATE_RUNTIME_READY_WAIT_MS = 240_000
const GRADUATE_RUNTIME_READY_POLL_MS = 5_000
const GRADUATE_RUNTIME_PROBE_TIMEOUT_MS = 30_000

export async function proveGraduateServedIdentity(
  inference: LocalInferenceConfig,
  model: string,
  options: { waitMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ ok: boolean; model: string; error?: string; via?: 'models' | 'ready'; attempts: number }> {
  const fetchImpl = options.fetchImpl || fetch
  const waitMs = Math.max(0, Math.min(options.waitMs ?? GRADUATE_RUNTIME_READY_WAIT_MS, 280_000))
  const deadline = Date.now() + waitMs
  const headers: Record<string, string> = inference.apiKey
    ? { Authorization: `Bearer ${inference.apiKey}`, 'x-api-key': inference.apiKey }
    : {}
  const baseUrl = inference.baseUrl.replace(/\/$/, '')
  const origin = new URL(baseUrl).origin
  let mode: 'models' | 'ready' = 'models'
  let lastError = 'graduate_runtime_not_ready'
  let attempts = 0

  do {
    attempts += 1
    const remaining = Math.max(1_000, deadline - Date.now())
    try {
      const url = mode === 'models' ? `${baseUrl}/models` : `${origin}/ready`
      const response = await fetchImpl(url, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(GRADUATE_RUNTIME_PROBE_TIMEOUT_MS, remaining)),
      })
      if (mode === 'models') {
        if (response.status === 404 || response.status === 405) {
          mode = 'ready'
          continue
        }
        if (response.ok) {
          const data = await response.json().catch(() => null) as { data?: Array<{ id?: string }> } | null
          const served = data?.data?.some(item => item?.id === model) ?? false
          if (served) return { ok: true, model, via: 'models', attempts }
          return { ok: false, model: '', error: 'model_not_served', via: 'models', attempts }
        }
        lastError = `HTTP ${response.status}`
      } else {
        if (response.status === 200) {
          const data = await response.json().catch(() => null) as { ready?: unknown; model?: unknown } | null
          const reported = clean(data?.model, 240)
          if (data?.ready === true && reported === model) return { ok: true, model: reported, via: 'ready', attempts }
          return { ok: false, model: reported, error: 'model_not_served', via: 'ready', attempts }
        }
        if (response.status === 503) {
          const detail = (await response.text().catch(() => '')).slice(0, 300)
          if (detail.includes('distilled_bootstrap_failed')) {
            return { ok: false, model: '', error: 'runtime_bootstrap_failed', via: 'ready', attempts }
          }
        }
        lastError = response.status === 204 ? 'runtime_booting' : `HTTP ${response.status}`
      }
    } catch (error) {
      lastError = error instanceof Error ? `${error.name}:${error.message}`.slice(0, 160) : 'probe_failed'
    }
    if (Date.now() + GRADUATE_RUNTIME_READY_POLL_MS >= deadline) break
    await new Promise(resolve => setTimeout(resolve, GRADUATE_RUNTIME_READY_POLL_MS))
  } while (Date.now() < deadline)

  return { ok: false, model: '', error: lastError, via: mode, attempts }
}

export function decideGraduateRuntimeBinding(input: GraduateRuntimeBindingInput) {
  const blockers: string[] = []
  const candidateId = clean(input.candidateId, 240)
  const trainedArtifactHash = clean(input.trainedArtifactHash, 64).toLowerCase()
  const runtimeModelId = clean(input.runtimeModelId, 240)
  const workerRoles = [...new Set(input.workerRoles)].filter(role => ROLES.has(role))
  const problemClasses = uniqueStrings(input.problemClasses, 160)

  if (!candidateId) blockers.push('graduate_runtime_candidate_missing')
  if (!HEX64.test(trainedArtifactHash)) blockers.push('graduate_runtime_artifact_hash_invalid')
  if (!runtimeModelId) blockers.push('graduate_runtime_model_missing')
  if (!['local_ai', 'graduate_ai'].includes(input.runtimeProfile)) blockers.push('graduate_runtime_profile_invalid')
  if (!workerRoles.length || workerRoles.length !== new Set(input.workerRoles).size) blockers.push('graduate_runtime_worker_scope_invalid')
  if (!problemClasses.length) blockers.push('graduate_runtime_problem_scope_missing')
  if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) blockers.push('graduate_runtime_time_invalid')

  return Object.freeze({
    eligibleForBinding: blockers.length === 0,
    candidateId,
    trainedArtifactHash,
    runtimeModelId,
    workerRoles: Object.freeze(workerRoles),
    problemClasses: Object.freeze(problemClasses),
    blockers: Object.freeze(blockers),
  })
}

/**
 * Bind an already-promoted graduate to an already-provisioned host runtime. This does not create or
 * pay for a GPU endpoint. It proves the exact model is served by an operator-configured profile,
 * then activates the graduate for only the declared worker/problem scopes. The promotion record
 * already proves independent evaluation, safety, unseen transfer, retention, Production canary and
 * rollback; this step proves the serving identity has not become an orphaned artifact.
 */
export async function activateGraduateRuntime(input: GraduateRuntimeBindingInput) {
  const decision = decideGraduateRuntimeBinding(input)
  if (!decision.eligibleForBinding) return { ...decision, activated: false as const }

  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')

  const existing = await db.from('cos_university_graduate_model_registry')
    .select('id,candidate_id,subject_id,student_model_id,trained_artifact_id,trained_artifact_hash,promotion_evidence_hash,status,rollback_artifact_ref,authority_expanded')
    .eq('candidate_id', decision.candidateId)
    .eq('trained_artifact_hash', decision.trainedArtifactHash)
    .maybeSingle()
  if (existing.error) throw existing.error
  const row = existing.data as Record<string, unknown> | null
  if (!row) throw new Error('graduate_registry_record_missing')
  if (row.authority_expanded !== false) throw new Error('graduate_runtime_authority_expansion_forbidden')
  if (!HEX64.test(clean(row.promotion_evidence_hash, 64))) throw new Error('graduate_runtime_promotion_evidence_missing')
  if (!clean(row.rollback_artifact_ref, 1000)) throw new Error('graduate_runtime_rollback_missing')
  if (!['pending_runtime', 'canary', 'active'].includes(clean(row.status, 40))) throw new Error('graduate_runtime_status_not_bindable')

  const runtime = resolveGraduateRuntimeProfile(input.runtimeProfile, decision.runtimeModelId)
  const health = input.runtimeProfile === 'graduate_ai'
    ? await proveGraduateServedIdentity(runtime.inference, decision.runtimeModelId)
    : await checkLocalInferenceHealth(runtime.inference)
  if (!health.ok || health.model !== decision.runtimeModelId) {
    return {
      ...decision,
      activated: false as const,
      blockers: Object.freeze([...decision.blockers, `graduate_runtime_health_failed:${health.error || 'model_not_served'}`]),
    }
  }

  const healthEvidenceHash = hash({
    profile: COS_UNIVERSITY_GRADUATE_RUNTIME_VERSION,
    runtimeProfile: input.runtimeProfile,
    provider: runtime.provider,
    model: decision.runtimeModelId,
    health: { ok: health.ok, model: health.model },
  })
  const activationEvidenceHash = hash({
    profile: COS_UNIVERSITY_GRADUATE_RUNTIME_VERSION,
    registryId: row.id,
    promotionEvidenceHash: row.promotion_evidence_hash,
    trainedArtifactHash: decision.trainedArtifactHash,
    healthEvidenceHash,
    workerRoles: decision.workerRoles,
    problemClasses: decision.problemClasses,
  })

  const updated = await db.from('cos_university_graduate_model_registry').update({
    status: 'active',
    runtime_profile: input.runtimeProfile,
    runtime_provider: runtime.provider,
    runtime_model_id: decision.runtimeModelId,
    runtime_health_evidence_hash: healthEvidenceHash,
    activation_evidence_hash: activationEvidenceHash,
    platform_scope: {
      kind: 'subject_relevant_cos_capability',
      subjectId: row.subject_id,
      owner: 'itmounts',
      orchestrator: 'cos',
      workerRoles: decision.workerRoles,
      problemClasses: decision.problemClasses,
    },
    activated_at: input.now.toISOString(),
    updated_at: input.now.toISOString(),
  })
    .eq('id', row.id)
    .eq('trained_artifact_hash', decision.trainedArtifactHash)
    .select('id,status,runtime_profile,runtime_provider,runtime_model_id,platform_scope')
    .maybeSingle()
  if (updated.error) throw updated.error
  if (!updated.data) throw new Error('graduate_runtime_activation_not_persisted')

  return {
    ...decision,
    activated: true as const,
    provider: runtime.provider,
    healthEvidenceHash,
    activationEvidenceHash,
  }
}

function scopeArray(scope: unknown, key: string): string[] {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return []
  const value = (scope as Record<string, unknown>)[key]
  return Array.isArray(value) ? uniqueStrings(value, 160) : []
}

/** Read only graduates that are already active and whose host-recorded scope matches this request. */
export async function activeGraduateRuntimesForRole(
  role: CosReasoningWorkerRole,
  objective: string,
): Promise<ActiveGraduateRuntime[]> {
  const db = cosServiceDb()
  if (!db) return []
  const problemClass = classifyProblemClass(objective)
  const rows = await db.from('cos_university_graduate_model_registry')
    .select('id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,status,runtime_profile,runtime_provider,runtime_model_id,runtime_health_evidence_hash,activation_evidence_hash,platform_scope,updated_at')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(20)
  if (rows.error) {
    console.warn('[cos-graduate-runtime] active registry read failed closed', rows.error)
    return []
  }

  const result: ActiveGraduateRuntime[] = []
  for (const raw of rows.data || []) {
    const row = raw as Record<string, unknown>
    const workerRoles = scopeArray(row.platform_scope, 'workerRoles')
    const problemClasses = scopeArray(row.platform_scope, 'problemClasses')
    if (!workerRoles.includes(role)) continue
    if (!(problemClasses.includes(problemClass) || problemClasses.includes('*'))) continue
    if (!HEX64.test(clean(row.runtime_health_evidence_hash, 64))) continue
    if (!HEX64.test(clean(row.activation_evidence_hash, 64))) continue
    const runtimeProfile = clean(row.runtime_profile, 40) as GraduateRuntimeProfile
    if (!['local_ai', 'graduate_ai'].includes(runtimeProfile)) continue
    const runtimeModelId = clean(row.runtime_model_id, 240)
    const storedProvider = normalizeProvider(row.runtime_provider)
    if (!runtimeModelId || !storedProvider) continue

    try {
      const runtime = resolveGraduateRuntimeProfile(runtimeProfile, runtimeModelId)
      if (runtime.provider !== storedProvider) continue
      const candidateId = clean(row.candidate_id, 240)
      const artifactId = clean(row.trained_artifact_id, 500)
      const artifactHash = clean(row.trained_artifact_hash, 64).toLowerCase()
      result.push(Object.freeze({
        registryId: clean(row.id, 100),
        candidateId,
        subjectId: clean(row.subject_id, 160),
        trainedArtifactId: artifactId,
        trainedArtifactHash: artifactHash,
        runtimeProfile,
        runtimeProvider: runtime.provider,
        runtimeModelId,
        workerRole: role,
        problemClass,
        inference: Object.freeze({
          ...runtime.inference,
          provider: runtime.provider,
          routeOwner: 'itmounts' as const,
          graduateCandidateId: candidateId,
          graduateArtifactId: artifactId,
          graduateArtifactHash: artifactHash,
        }),
        reasoner: runtime.reasoner,
      }))
    } catch (error) {
      console.warn('[cos-graduate-runtime] active binding no longer resolves; fail closed', error instanceof Error ? error.message : String(error))
    }
  }
  return result
}
