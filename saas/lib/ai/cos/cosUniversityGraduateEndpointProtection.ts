// saas/lib/ai/cos/cosUniversityGraduateEndpointProtection.ts
import { createHash } from 'node:crypto'
import { cosServiceDb } from '../../cos-core/storage/service-db.ts'
import { exactArtifactContainerImageFromEnv } from './runpodExactArtifactContainerImage.ts'

const ENDPOINT_ID = /^[a-z0-9_-]{3,120}$/i

export function graduateRunpodEndpointId(scope: unknown): string | null {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return null
  const raw = String((scope as Record<string, unknown>).runtimeBaseUrl || '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const suffix = '.api.runpod.ai'
    if (!url.hostname.endsWith(suffix)) return null
    const endpointId = url.hostname.slice(0, -suffix.length)
    return ENDPOINT_ID.test(endpointId) ? endpointId.toLowerCase() : null
  } catch {
    return null
  }
}

// Must equal MASS_DISTILLED_EXACT_ENDPOINT_GENERATION in runpodMassDistilledProvisionV2.ts. Kept as a
// literal to avoid an import cycle (V2 imports this module); the gated Residency test locks them together.
export const RESIDENCY_RUNPOD_ENDPOINT_GENERATION = 'v5' as const

/**
 * The one Residency runtime key. The immutable exact-artifact image digest is part of the key, so a new
 * published image always yields a new Residency endpoint name. RunPod rejects container mutation of an
 * existing endpoint, and the provisioner correctly fails closed on image drift; without the digest here,
 * an endpoint created under an older image would reject that resident forever.
 */
export function builderResidencyRuntimeKey(
  candidateId: unknown,
  artifactHash: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const candidate = String(candidateId || '').trim()
  const artifact = String(artifactHash || '').trim().toLowerCase()
  if (!candidate.startsWith('mass:') || !/^[a-f0-9]{64}$/.test(artifact)) return null
  const image = exactArtifactContainerImageFromEnv('standard', env)
  return createHash('sha256')
    .update(JSON.stringify(['builder-residency-runtime-v1', candidate, artifact, image]))
    .digest('hex')
    .slice(0, 10)
}

export function residencyRunpodEndpointName(
  candidateId: unknown,
  artifactHash: unknown,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const runtimeKey = builderResidencyRuntimeKey(candidateId, artifactHash, env)
  if (!runtimeKey) return null
  const artifact = String(artifactHash || '').trim().toLowerCase()
  return `itmounts-mass-distilled-${artifact.slice(0, 12)}-${runtimeKey}-${RESIDENCY_RUNPOD_ENDPOINT_GENERATION}`
}

const RESIDENCY_ENDPOINT_LEASE_MS = 15 * 60_000

export async function activeResidencyRunpodEndpointNames(now = new Date()): Promise<ReadonlySet<string>> {
  const db = cosServiceDb()
  if (!db) throw new Error('residency_endpoint_protection_database_unavailable')

  // Protect only Residency cases that are actually executing. Standing enrollment alone is not a
  // compute lease: keeping every resident at maxWorkers=1 permanently consumes the account-wide
  // RunPod worker quota and can starve evaluation/canary lanes indefinitely.
  //
  // startCase() writes status='started' before exact-artifact provisioning/execution, so this lease
  // exists before any worker must be protected. The bounded 15-minute window also releases a stale
  // lease after a crashed Vercel invocation without weakening Residency evidence or promotion gates.
  const since = new Date(now.getTime() - RESIDENCY_ENDPOINT_LEASE_MS).toISOString()
  const activeCases = await db.from('cos_university_residency_case_runs')
    .select('residency_id,created_at')
    .eq('status', 'started')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(32)
  if (activeCases.error) throw activeCases.error

  const residencyIds = [...new Set((activeCases.data || [])
    .map(row => String((row as { residency_id?: unknown }).residency_id || '').trim())
    .filter(Boolean))]
  if (!residencyIds.length) return new Set<string>()

  const rows = await db.from('cos_university_residency_enrollments')
    .select('id,candidate_id,trained_artifact_hash,authority_expanded')
    .in('id', residencyIds)
    .eq('authority_expanded', false)
    .limit(32)
  if (rows.error) throw rows.error

  const names = new Set<string>()
  for (const row of rows.data || []) {
    const name = residencyRunpodEndpointName(
      (row as { candidate_id?: unknown }).candidate_id,
      (row as { trained_artifact_hash?: unknown }).trained_artifact_hash,
    )
    if (name) names.add(name)
  }
  return names
}

export async function activeGraduateRunpodEndpointIds(): Promise<ReadonlySet<string>> {
  const db = cosServiceDb()
  if (!db) throw new Error('graduate_endpoint_protection_database_unavailable')
  const rows = await db.from('cos_university_graduate_model_registry')
    .select('platform_scope')
    .eq('status', 'active')
    .eq('runtime_provider', 'runpod')
    .limit(200)
  if (rows.error) throw rows.error
  const ids = new Set<string>()
  for (const row of rows.data || []) {
    const endpointId = graduateRunpodEndpointId((row as { platform_scope?: unknown }).platform_scope)
    if (endpointId) ids.add(endpointId)
  }
  return ids
}


const MASS_CANARY_PROFILE = 'cos_local_distilled_runtime_deploy_v1'
const MASS_CANARY_ACTIVE_MS = 10 * 60 * 1000

/**
 * A concurrent exact-artifact canary owns its RunPod endpoint until a terminal pass/fail is recorded.
 * Provisioning another artifact must not reclaim that endpoint's worker reservation during the bounded
 * overlap window.
 */
export async function activeCanaryRunpodEndpointIds(now = new Date()): Promise<ReadonlySet<string>> {
  const db = cosServiceDb()
  if (!db) throw new Error('canary_endpoint_protection_database_unavailable')
  const since = new Date(now.getTime() - MASS_CANARY_ACTIVE_MS).toISOString()
  const rows = await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,observed_at,evidence')
    .eq('event_type', 'fine_tune')
    .contains('evidence', { profile: MASS_CANARY_PROFILE })
    .gte('observed_at', since)
    .order('observed_at', { ascending: true })
    .limit(1000)
  if (rows.error) throw rows.error

  const active = new Map<string, { endpointId: string; startedAt: number }>()
  for (const row of rows.data || []) {
    const evidence = (row as { evidence?: Record<string, unknown> }).evidence || {}
    const claim = String(evidence.claim || '')
    const artifactHash = String(evidence.artifactHash || '').toLowerCase()
    const candidateId = String((row as { candidate_id?: unknown }).candidate_id || '')
    const key = candidateId && artifactHash ? `${candidateId}\u0000${artifactHash}` : ''
    const observedAt = Date.parse(String((row as { observed_at?: unknown }).observed_at || ''))
    if (!key || !Number.isFinite(observedAt)) continue
    if (claim === 'local_distilled_runtime_canary_invocation_started') {
      const endpointId = String(evidence.endpointId || '').trim().toLowerCase()
      if (ENDPOINT_ID.test(endpointId)) active.set(key, { endpointId, startedAt: observedAt })
      continue
    }
    if (['local_distilled_runtime_canary_passed', 'local_distilled_runtime_canary_failed'].includes(claim)) {
      const current = active.get(key)
      if (current && observedAt >= current.startedAt) active.delete(key)
    }
  }
  return new Set([...active.values()].map(value => value.endpointId))
}


const MASS_EVALUATION_PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'
const MASS_EVALUATION_ACTIVE_MS = 12 * 60 * 1000

/**
 * Evaluation reservations are cost-bearing leases on exact-artifact endpoints. A newer canary must not
 * reclaim their max worker while the evaluator is inside its bounded 12-minute reservation window.
 * Terminal evaluation evidence releases the endpoint immediately; stale reservations age out.
 */
export async function activeEvaluationRunpodEndpointIds(now = new Date()): Promise<ReadonlySet<string>> {
  const db = cosServiceDb()
  if (!db) throw new Error('evaluation_endpoint_protection_database_unavailable')
  const since = new Date(now.getTime() - MASS_EVALUATION_ACTIVE_MS).toISOString()
  const rows = await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,observed_at,evidence')
    .eq('event_type', 'fine_tune')
    .contains('evidence', { profile: MASS_EVALUATION_PROFILE })
    .gte('observed_at', since)
    .order('observed_at', { ascending: true })
    .limit(1000)
  if (rows.error) throw rows.error

  const active = new Map<string, { endpointId: string; startedAt: number }>()
  for (const row of rows.data || []) {
    const evidence = (row as { evidence?: Record<string, unknown> }).evidence || {}
    const claim = String(evidence.claim || '')
    const artifactHash = String(evidence.artifactHash || '').toLowerCase()
    const candidateId = String((row as { candidate_id?: unknown }).candidate_id || '')
    const key = candidateId && artifactHash ? `${candidateId}\u0000${artifactHash}` : ''
    const observedAt = Date.parse(String((row as { observed_at?: unknown }).observed_at || ''))
    if (!key || !Number.isFinite(observedAt)) continue
    if (claim === 'mass_distilled_independent_evaluation_started' && evidence.reservationOnly === true) {
      const endpointId = String(evidence.endpointId || '').trim().toLowerCase()
      if (ENDPOINT_ID.test(endpointId)) active.set(key, { endpointId, startedAt: observedAt })
      continue
    }
    if (['mass_distilled_independent_evaluation_completed', 'mass_distilled_independent_evaluation_failed'].includes(claim)) {
      const current = active.get(key)
      if (current && observedAt >= current.startedAt) active.delete(key)
    }
  }
  return new Set([...active.values()].map(value => value.endpointId))
}

export async function protectedRunpodEndpointIds(now = new Date()): Promise<ReadonlySet<string>> {
  const [graduates, evaluations, canaries] = await Promise.all([
    activeGraduateRunpodEndpointIds(),
    activeEvaluationRunpodEndpointIds(now),
    activeCanaryRunpodEndpointIds(now),
  ])
  return new Set([...graduates, ...evaluations, ...canaries])
}
