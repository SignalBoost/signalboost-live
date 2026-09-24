// saas/lib/ai/cos/cosUniversityGraduateEndpointProtection.ts
import { createHash } from 'node:crypto'
import { cosServiceDb } from '../../cos-core/storage/service-db.ts'

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

export const BUILDER_RESIDENCY_RUNTIME_IDENTITY_VERSION = 'builder-residency-runtime-v2' as const

export function residencyRunpodRuntimeKey(candidateId: unknown, artifactHash: unknown): string | null {
  const candidate = String(candidateId || '').trim()
  const artifact = String(artifactHash || '').trim().toLowerCase()
  if (!candidate.startsWith('mass:') || !/^[a-f0-9]{64}$/.test(artifact)) return null
  return createHash('sha256')
    .update(JSON.stringify([BUILDER_RESIDENCY_RUNTIME_IDENTITY_VERSION, candidate, artifact]))
    .digest('hex')
    .slice(0, 10)
}

export function residencyRunpodEndpointName(candidateId: unknown, artifactHash: unknown): string | null {
  const artifact = String(artifactHash || '').trim().toLowerCase()
  const runtimeKey = residencyRunpodRuntimeKey(candidateId, artifact)
  if (!runtimeKey) return null
  return `itmounts-mass-distilled-${artifact.slice(0, 12)}-${runtimeKey}-v3`
}

export async function activeResidencyRunpodEndpointNames(): Promise<ReadonlySet<string>> {
  const db = cosServiceDb()
  if (!db) throw new Error('residency_endpoint_protection_database_unavailable')
  const rows = await db.from('cos_university_residency_enrollments')
    .select('candidate_id,trained_artifact_hash')
    .in('standing', ['resident', 'senior_resident', 'remediation_required'])
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
  const [graduates, evaluations] = await Promise.all([
    activeGraduateRunpodEndpointIds(),
    activeEvaluationRunpodEndpointIds(now),
  ])
  return new Set([...graduates, ...evaluations])
}
