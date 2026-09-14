import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { LocalInferenceUsageContext } from './localInferenceUsage.ts'

export const PLATFORM_OWNED_INFERENCE_PROFILE = 'itmounts-platform-owned-graduate-routing-v1' as const

export type GraduateRuntimeProfile = 'local_ai' | 'graduate_ai'

export type PlatformOwnedInferenceRoute = Readonly<{
  profile: typeof PLATFORM_OWNED_INFERENCE_PROFILE
  candidateId: string
  subjectId: string
  artifactId: string
  artifactHash: string
  runtimeProfile: GraduateRuntimeProfile
  runtimeProvider: string
  runtimeModelId: string
  cacheDiscriminator: string
  config: Readonly<{
    baseUrl: string
    model: string
    apiKey?: string
    timeoutMs: number
    provider?: string
    routeOwner: 'itmounts'
    graduateCandidateId: string
    graduateArtifactId: string
    graduateArtifactHash: string
  }>
}>

type GraduateRow = Readonly<{
  candidate_id: string
  subject_id: string
  trained_artifact_id: string
  trained_artifact_hash: string
  status: string
  runtime_profile: GraduateRuntimeProfile | null
  runtime_provider: string | null
  runtime_model_id: string | null
  runtime_health_evidence_hash: string | null
  activation_evidence_hash: string | null
  authority_expanded: boolean
  activated_at: string | null
  updated_at: string | null
}>

const HEX64 = /^[a-f0-9]{64}$/i
const CACHE_MS = 30_000
const routeCache = new Map<string, { expiresAt: number; row: GraduateRow | null }>()
let dbCache: SupabaseClient | null | undefined

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '')
}

function internalHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === 'ai-brain'
}

function allowedHosts(value: string | undefined): Set<string> {
  return new Set(String(value || '').split(',').map(normalizeHost).filter(Boolean))
}

function serviceDb(): SupabaseClient | null {
  if (dbCache !== undefined) return dbCache
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  dbCache = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
  return dbCache
}

function featureText(context?: LocalInferenceUsageContext): string {
  return [context?.feature, context?.purpose, context?.agentId].map(value => clean(value, 180).toLowerCase()).filter(Boolean).join(' ')
}

/**
 * University grading/training remains separated from graduates. A distilled student may do iTMounts
 * Production work after activation, but it cannot teach, grade, evaluate or manufacture evidence for
 * its own academic/promotion path.
 */
export function graduateRoutingSubject(context?: LocalInferenceUsageContext): string | null {
  if (process.env.COS_GRADUATE_ROUTING_ENABLED === 'false') return null
  const explicit = clean(context?.subjectId, 160)
  const text = featureText(context)
  if (/university|teacher|evaluator|evaluation|exam|grading|fine[_ -]?tune|distillation|training[_ -]?executor|non[_ -]?credit[_ -]?training|independent[_ -]?assessment/.test(text)) {
    return null
  }
  if (explicit) return explicit
  if (/builder|coding|software|platform[_ -]?engineer/.test(text)) return 'computer_science'
  if (/cyber|security|audit/.test(text)) return 'cybersecurity'
  if (/statistics|analytics|quantitative|data[_ -]?science/.test(text)) return 'statistics_data_science'
  if (/business|operations|governance/.test(text)) return 'business_operations'
  if (/cos|chief[_ -]?of[_ -]?staff|concierge|support|reasoner|platform[_ -]?text|general[_ -]?reasoning/.test(text)) {
    return 'reasoning_decision_science'
  }
  return null
}

async function activeGraduate(subjectId: string): Promise<GraduateRow | null> {
  const cached = routeCache.get(subjectId)
  if (cached && cached.expiresAt > Date.now()) return cached.row
  const db = serviceDb()
  if (!db) return null
  const result = await db.from('cos_university_graduate_model_registry')
    .select('candidate_id,subject_id,trained_artifact_id,trained_artifact_hash,status,runtime_profile,runtime_provider,runtime_model_id,runtime_health_evidence_hash,activation_evidence_hash,authority_expanded,activated_at,updated_at')
    .eq('status', 'active')
    .eq('authority_expanded', false)
    .eq('subject_id', subjectId)
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) {
    console.warn('[platform-owned-routing-registry-read-failed]', result.error.message)
    return null
  }
  const row = result.data as GraduateRow | null
  routeCache.set(subjectId, { expiresAt: Date.now() + CACHE_MS, row })
  return row
}

function timeout(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1_000, Math.min(600_000, Math.floor(parsed))) : fallback
}

function providerFromUrl(baseUrl: string, explicit?: string | null): string {
  const configured = clean(explicit, 80).toLowerCase()
  if (configured) return configured.replace(/[^a-z0-9._-]+/g, '-')
  try {
    const host = normalizeHost(new URL(baseUrl).hostname)
    if (host === 'api.deepinfra.com' || host.endsWith('.deepinfra.com')) return 'deepinfra'
    if (internalHost(host)) return 'self_hosted'
    if (host.includes('huggingface')) return 'huggingface'
    return host
  } catch {
    return 'unknown'
  }
}

function validatedEndpoint(input: {
  baseUrl: string
  apiKey?: string
  allowed: Set<string>
  timeoutMs: number
  model: string
  provider?: string | null
  row: GraduateRow
}): PlatformOwnedInferenceRoute | null {
  const model = clean(input.model, 300)
  if (!model) return null
  let url: URL
  try { url = new URL(input.baseUrl) } catch { return null }
  const host = normalizeHost(url.hostname)
  const internal = internalHost(host)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!internal && url.protocol !== 'https:') return null
  if (!internal && !input.allowed.has(host)) return null
  if (!internal && !clean(input.apiKey, 4096)) return null
  if (url.username || url.password) return null
  const artifactHash = clean(input.row.trained_artifact_hash, 64).toLowerCase()
  if (!HEX64.test(artifactHash)) return null
  const runtimeProvider = providerFromUrl(url.toString(), input.provider || input.row.runtime_provider)
  const cacheDiscriminator = [
    PLATFORM_OWNED_INFERENCE_PROFILE,
    input.row.candidate_id,
    artifactHash,
    input.row.runtime_profile,
    runtimeProvider,
    model,
  ].join(':')
  return Object.freeze({
    profile: PLATFORM_OWNED_INFERENCE_PROFILE,
    candidateId: input.row.candidate_id,
    subjectId: input.row.subject_id,
    artifactId: input.row.trained_artifact_id,
    artifactHash,
    runtimeProfile: input.row.runtime_profile as GraduateRuntimeProfile,
    runtimeProvider,
    runtimeModelId: model,
    cacheDiscriminator,
    config: Object.freeze({
      baseUrl: url.toString().replace(/\/$/, ''),
      model,
      apiKey: clean(input.apiKey, 4096) || undefined,
      timeoutMs: input.timeoutMs,
      provider: runtimeProvider,
      routeOwner: 'itmounts' as const,
      graduateCandidateId: input.row.candidate_id,
      graduateArtifactId: input.row.trained_artifact_id,
      graduateArtifactHash: artifactHash,
    }),
  })
}

function routeForRow(row: GraduateRow): PlatformOwnedInferenceRoute | null {
  if (row.status !== 'active'
    || row.authority_expanded !== false
    || !row.runtime_profile
    || !clean(row.runtime_provider, 80)
    || !clean(row.runtime_model_id, 300)
    || !HEX64.test(clean(row.runtime_health_evidence_hash, 64))
    || !HEX64.test(clean(row.activation_evidence_hash, 64))
    || !row.activated_at) return null

  if (row.runtime_profile === 'graduate_ai') {
    const key = process.env.COS_GRADUATE_AI_API_KEY?.trim() || process.env.HF_TOKEN?.trim() || undefined
    return validatedEndpoint({
      baseUrl: process.env.COS_GRADUATE_AI_BASE_URL?.trim() || '',
      apiKey: key,
      allowed: allowedHosts(process.env.COS_GRADUATE_AI_ALLOWED_HOSTS),
      timeoutMs: timeout(process.env.COS_GRADUATE_AI_TIMEOUT_MS, 120_000),
      model: row.runtime_model_id || '',
      provider: process.env.COS_GRADUATE_AI_PROVIDER || row.runtime_provider,
      row,
    })
  }

  if (row.runtime_profile === 'local_ai') {
    return validatedEndpoint({
      baseUrl: process.env.LOCAL_AI_BASE_URL?.trim() || '',
      apiKey: process.env.LOCAL_AI_API_KEY?.trim() || undefined,
      allowed: allowedHosts(process.env.LOCAL_AI_ALLOWED_HOSTS),
      timeoutMs: timeout(process.env.LOCAL_AI_TIMEOUT_MS, 120_000),
      model: row.runtime_model_id || '',
      provider: row.runtime_provider || process.env.LOCAL_AI_MANAGED_PROVIDER,
      row,
    })
  }

  return null
}

export async function resolvePlatformOwnedInferenceRoute(context?: LocalInferenceUsageContext): Promise<PlatformOwnedInferenceRoute | null> {
  const subjectId = graduateRoutingSubject(context)
  if (!subjectId) return null
  const row = await activeGraduate(subjectId)
  if (!row) return null
  const route = routeForRow(row)
  if (!route) {
    console.warn('[platform-owned-routing-active-graduate-not-callable]', JSON.stringify({
      candidateId: row.candidate_id,
      subjectId: row.subject_id,
      runtimeProfile: row.runtime_profile,
      hasHealthEvidence: Boolean(row.runtime_health_evidence_hash),
      hasActivationEvidence: Boolean(row.activation_evidence_hash),
    }))
  }
  return route
}

/** Cache identity changes as soon as the active graduate/artifact/runtime changes. */
export async function platformOwnedInferenceCacheDiscriminator(context?: LocalInferenceUsageContext): Promise<string> {
  const subjectId = graduateRoutingSubject(context)
  if (!subjectId) return 'graduate-routing:not-eligible'
  const route = await resolvePlatformOwnedInferenceRoute(context)
  return route?.cacheDiscriminator || `graduate-routing:${subjectId}:default-runtime`
}

export function clearPlatformOwnedInferenceRouteCache(): void {
  routeCache.clear()
}
