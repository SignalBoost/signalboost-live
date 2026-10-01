import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  checkLocalInferenceHealth,
  localInferenceConfigFromEnv,
  type LocalInferenceConfig,
} from '@/lib/ai/local-inference'
import { classifyProblemClass } from '@/lib/ai/cos/cosProblemClass'
import { classifyCosUniversitySubjects } from '@/lib/ai/cos/cosUniversity'
import { classifyInferenceHost } from '@/lib/ai/cos/reasonerHostingDisclosure'
import { configuredRunpodApiKey } from '@/lib/ai/cos/runpodConfig'
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
  runtimeBaseUrl?: string
  workerRoles: readonly CosReasoningWorkerRole[]
  problemClasses: readonly string[]
  now: Date
}>

const HEX64 = /^[a-f0-9]{64}$/i
const ROLES = new Set<CosReasoningWorkerRole>(['primary', 'coder', 'critic', 'verifier', 'researcher', 'context_engineer'])
const RUNPOD_SERVERLESS_HOST = /^([a-z0-9]+)\.api\.runpod\.ai$/i

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

function exactRunpodEndpointId(value: unknown): string | null {
  const raw = clean(value, 2000)
  if (!raw) return null
  try {
    const url = new URL(raw)
    const match = RUNPOD_SERVERLESS_HOST.exec(url.hostname)
    if (!match || url.protocol !== 'https:' || !/^\/v1\/?$/.test(url.pathname) || url.username || url.password || url.search || url.hash) return null
    return match[1].toLowerCase()
  } catch {
    return null
  }
}

function graduateManagedConfig(model: string, runtimeBaseUrl?: string): { inference: LocalInferenceConfig; provider: string; reasoner: CosReasonerConfig } {
  const explicitBaseUrl = clean(runtimeBaseUrl, 2000)
  const baseUrlRaw = explicitBaseUrl || clean(process.env.COS_GRADUATE_AI_BASE_URL, 2000)
  if (!baseUrlRaw) throw new Error('graduate_runtime_base_url_not_configured')
  const url = new URL(baseUrlRaw)
  const host = url.hostname.trim().toLowerCase().replace(/^\[|\]$/g, '')
  const classification = classifyInferenceHost(baseUrlRaw)
  const exactRunpod = explicitBaseUrl ? exactRunpodEndpointId(explicitBaseUrl) : null
  const apiKey = clean(process.env.COS_GRADUATE_AI_API_KEY, 4000) || (exactRunpod ? configuredRunpodApiKey() || undefined : undefined)

  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('graduate_runtime_invalid_protocol')
  if (!classification.selfHosted) {
    const allowedHosts = new Set(
      String(process.env.COS_GRADUATE_AI_ALLOWED_HOSTS || '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean),
    )
    if (!exactRunpod && !allowedHosts.has(host)) throw new Error('graduate_runtime_host_not_allowed')
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
    : exactRunpod
      ? 'runpod'
      : normalizeProvider(process.env.COS_GRADUATE_AI_MANAGED_PROVIDER) || classification.provider || 'managed-open-model'
  const baseUrl = url.toString().replace(/\/$/, '')
  const inference: LocalInferenceConfig = { baseUrl, model, apiKey, timeoutMs: timeoutValue, provider }
  const reasoner: CosReasonerConfig = classification.selfHosted
    ? { kind: 'independent-local', label: `independent-local:${model}` }
    : { kind: 'managed-open-model', label: `managed-open-model:${provider}:${model}` }
  return { inference, provider, reasoner }
}

export function resolveGraduateRuntimeProfile(profile: GraduateRuntimeProfile, modelInput: string, runtimeBaseUrl?: string) {
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

  return graduateManagedConfig(model, runtimeBaseUrl)
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

  const runtime = resolveGraduateRuntimeProfile(input.runtimeProfile, decision.runtimeModelId, input.runtimeBaseUrl)
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
    baseUrl: runtime.inference.baseUrl,
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
      kind: decision.workerRoles.includes('primary') ? 'cos_generalist_primary' : 'subject_relevant_cos_capability',
      subjectId: row.subject_id,
      owner: 'itmounts',
      orchestrator: 'cos',
      workerRoles: decision.workerRoles,
      problemClasses: decision.problemClasses,
      ...(input.runtimeProfile === 'graduate_ai' ? { runtimeBaseUrl: runtime.inference.baseUrl } : {}),
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

function scopeString(scope: unknown, key: string, limit = 2000): string {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return ''
  return clean((scope as Record<string, unknown>)[key], limit)
}

function scopeArray(scope: unknown, key: string): string[] {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return []
  const value = (scope as Record<string, unknown>)[key]
  return Array.isArray(value) ? uniqueStrings(value, 160) : []
}

/**
 * WORKFORCE (owner direction 2026-09-29: "they cannot be in the university"). COS hires its workers from the
 * Workforce roster, not from the University. The roster names who is on call; every serving gate (active status,
 * health and activation evidence, exact runtime binding) is still re-checked on the graduate's University diploma
 * record below, so a roster row alone can never make a model callable. An unreadable roster fails closed.
 */
export const COS_WORKFORCE_ROSTER_TABLE = 'cos_workforce_roster' as const

async function onCallWorkforceRegistryIds(db: NonNullable<ReturnType<typeof cosServiceDb>>): Promise<string[] | null> {
  const roster = await db.from(COS_WORKFORCE_ROSTER_TABLE)
    .select('registry_id')
    .eq('status', 'on_call')
    .eq('authority_expanded', false)
    .limit(200)
  if (roster.error) {
    console.warn('[cos-workforce] roster read failed closed', roster.error)
    return null
  }
  return [...new Set((roster.data || [])
    .map(row => clean((row as { registry_id?: unknown }).registry_id, 100))
    .filter(Boolean))]
}

/** Read only on-call Workforce graduates whose University diploma is still active and whose host-recorded scope matches this request. A governed COS-primary graduate may use the explicit '*' generalist scope. */
export async function activeGraduateRuntimesForRole(
  role: CosReasoningWorkerRole,
  objective: string,
): Promise<ActiveGraduateRuntime[]> {
  const db = cosServiceDb()
  if (!db) return []
  const onCall = await onCallWorkforceRegistryIds(db)
  if (!onCall || !onCall.length) return []
  const problemClass = classifyProblemClass(objective)
  const universitySubjects = classifyCosUniversitySubjects(objective)
  const rows = await db.from('cos_university_graduate_model_registry')
    .select('id,candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,status,runtime_profile,runtime_provider,runtime_model_id,runtime_health_evidence_hash,activation_evidence_hash,platform_scope,updated_at')
    .eq('status', 'active')
    .in('id', onCall)
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
    // Backward compatibility: pre-namespace activations stored the exact canonical University
    // subject id directly. Accept only that exact classifier id or the new namespaced marker.
    const universityScoped = universitySubjects.some(subjectId =>
      problemClasses.includes(`university:${subjectId}`) || problemClasses.includes(subjectId),
    )
    if (!(problemClasses.includes(problemClass) || problemClasses.includes('*') || universityScoped)) continue
    if (!HEX64.test(clean(row.runtime_health_evidence_hash, 64))) continue
    if (!HEX64.test(clean(row.activation_evidence_hash, 64))) continue
    const runtimeProfile = clean(row.runtime_profile, 40) as GraduateRuntimeProfile
    if (!['local_ai', 'graduate_ai'].includes(runtimeProfile)) continue
    const runtimeModelId = clean(row.runtime_model_id, 240)
    const storedProvider = normalizeProvider(row.runtime_provider)
    const runtimeBaseUrl = scopeString(row.platform_scope, 'runtimeBaseUrl')
    if (!runtimeModelId || !storedProvider) continue

    try {
      const runtime = resolveGraduateRuntimeProfile(runtimeProfile, runtimeModelId, runtimeBaseUrl || undefined)
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
  // Production proving is real-work-first: never fabricate apprenticeship tasks. Instead, distribute
  // genuine matching COS demand fairly so a recently activated worker cannot monopolize every request.
  // Never-tried graduates go first; afterwards the least-recently-served graduate gets the next chance.
  // Serving history changes scheduling only. It never widens role/problem scope or bypasses diploma gates.
  if (result.length > 1) {
    const ids = result.map(runtime => runtime.registryId)
    const attempts = await db.from('cos_university_graduate_serving_attempts')
      .select('registry_id,recorded_at')
      .in('registry_id', ids)
      .order('recorded_at', { ascending: false })
      .limit(1000)
    if (!attempts.error) {
      const lastServed = new Map<string, number>()
      for (const raw of attempts.data || []) {
        const row = raw as { registry_id?: unknown; recorded_at?: unknown }
        const id = clean(row.registry_id, 100)
        if (!id || lastServed.has(id)) continue
        const at = Date.parse(clean(row.recorded_at, 80))
        lastServed.set(id, Number.isFinite(at) ? at : 0)
      }
      result.sort((a, b) => (lastServed.get(a.registryId) ?? -1) - (lastServed.get(b.registryId) ?? -1))
    } else {
      console.warn('[cos-workforce] serving-history read failed; preserve deterministic registry order', attempts.error)
    }
  }
  return result


/**
 * Workforce proving lane: select one graduate for advisory/shadow work on a genuine Production objective.
 * This reuses the exact diploma/roster/scope gates above but may choose any recorded specialist role that
 * matches the real task. It never adds a role, widens problem scope, or authorizes the shadow result to
 * replace the user-visible Production answer.
 */
export async function activeGraduateApprenticeForObjective(
  objective: string,
): Promise<ActiveGraduateRuntime | null> {
  const roles: readonly CosReasoningWorkerRole[] = ['critic', 'verifier', 'researcher', 'context_engineer', 'coder']
  for (const role of roles) {
    const eligible = await activeGraduateRuntimesForRole(role, objective)
    if (eligible.length) return eligible[0]
  }
  return null
}

}
// end of saas/lib/ai/cos/cosUniversityGraduateRuntime.ts (if this line is missing, the paste was cut short)
