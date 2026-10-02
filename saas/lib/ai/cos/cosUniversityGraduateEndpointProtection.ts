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

export async function activeGraduateRunpodEndpointIds(_now = new Date()): Promise<ReadonlySet<string>> {
  const db = cosServiceDb()
  if (!db) throw new Error('graduate_endpoint_protection_database_unavailable')

  // Workforce has no time-based graduate rotation. Protect every active, governed RunPod runtime
  // that belongs to an on-call Workforce worker. This protects exact serving identity from generic
  // quota-recovery reclamation; it does not set minWorkers > 0 or create standing GPU spend.
  const roster = await db.from('cos_workforce_roster')
    .select('registry_id')
    .eq('status', 'on_call')
    .eq('authority_expanded', false)
    .limit(200)
  if (roster.error) throw roster.error
  const registryIds = [...new Set((roster.data || [])
    .map(row => String((row as { registry_id?: unknown }).registry_id || '').trim())
    .filter(Boolean))]
  if (!registryIds.length) return new Set<string>()

  const rows = await db.from('cos_university_graduate_model_registry')
    .select('platform_scope')
    .eq('status', 'active')
    .eq('runtime_provider', 'runpod')
    .eq('authority_expanded', false)
    .in('id', registryIds)
    .limit(200)
  if (rows.error) throw rows.error

  return new Set((rows.data || [])
    .map(row => graduateRunpodEndpointId((row as { platform_scope?: unknown }).platform_scope))
    .filter((endpointId): endpointId is string => Boolean(endpointId)))
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

const PENDING_GRADUATE_CANARY_CLAIM = 'local_distilled_runtime_canary_passed'
const PENDING_GRADUATE_ARTIFACT_LIMIT = 200

/**
 * Artifacts that PASSED every gate and are waiting to be registered and activated.
 *
 * Production 2026-10-02: mass:9c350ca1fac4 sat at `runtime_pending` for days with its proven canary endpoint
 * (itmounts-mass-distilled-9c350ca1fac4-db505a42e0-v3) the only mass-distilled endpoint in the account still holding
 * a worker. That pin was the ONLY thing keeping the endpoint alive: it is on no Workforce roster and holds no active
 * registry row, so activeGraduateRunpodEndpointIds excludes it, and the 10-minute canary and 12-minute evaluation
 * windows expired long ago.
 *
 * Widening reclaim to stale endpoint GENERATIONS removed that accident. Every one of the 393 live mass-distilled
 * endpoints is a superseded generation (391 '-v3', 2 '-v2', zero '-v5'), so a waiting artifact's endpoint became
 * reclaimable, drains to 0/0, and deleteTerminalMassDistilledRunpodEndpoint deletes exactly an endpoint at 0/0 whose
 * name carries that prefix. Activation binds a graduate to the EXACT endpoint id its canary proved and never
 * recreates one, so the delete is unrecoverable.
 *
 * Protected by the endpoint id recorded on the artifact's own passing exact-artifact canary, so this grants nothing an
 * artifact did not already earn. Bounded, read-only, and unrelated to spend: it stops a reclaim, it never raises
 * capacity or sets minWorkers above zero.
 */
export async function pendingGraduateRunpodEndpointIds(): Promise<ReadonlySet<string>> {
  const db = cosServiceDb()
  if (!db) throw new Error('pending_graduate_endpoint_protection_database_unavailable')
  const artifacts = await db.from('cos_local_distillation_artifacts')
    .select('candidate_id,trained_artifact_hash')
    .eq('status', 'runtime_pending')
    .like('candidate_id', 'mass:%')
    .order('created_at', { ascending: true })
    .limit(PENDING_GRADUATE_ARTIFACT_LIMIT)
  if (artifacts.error) throw artifacts.error

  const wanted = new Map<string, string>()
  for (const row of artifacts.data || []) {
    const candidateId = String((row as { candidate_id?: unknown }).candidate_id || '').trim()
    const artifactHash = String((row as { trained_artifact_hash?: unknown }).trained_artifact_hash || '')
      .trim().toLowerCase()
    if (candidateId && /^[a-f0-9]{64}$/.test(artifactHash)) wanted.set(candidateId, artifactHash)
  }
  if (!wanted.size) return new Set<string>()

  const events = await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,evidence')
    .eq('event_type', 'fine_tune')
    .in('candidate_id', [...wanted.keys()])
    .contains('evidence', { claim: PENDING_GRADUATE_CANARY_CLAIM, exactArtifact: true })
    .limit(2000)
  if (events.error) throw events.error

  const ids = new Set<string>()
  for (const row of events.data || []) {
    const evidence = (row as { evidence?: Record<string, unknown> }).evidence || {}
    const candidateId = String((row as { candidate_id?: unknown }).candidate_id || '').trim()
    // Protected only for the exact artifact hash still sitting at runtime_pending.
    if (wanted.get(candidateId) !== String(evidence.artifactHash || '').trim().toLowerCase()) continue
    const endpointId = String(evidence.endpointId || '').trim().toLowerCase()
    if (ENDPOINT_ID.test(endpointId)) ids.add(endpointId)
  }
  return ids
}

export async function protectedRunpodEndpointIds(now = new Date()): Promise<ReadonlySet<string>> {
  const [graduates, pendingGraduates, evaluations, canaries] = await Promise.all([
    activeGraduateRunpodEndpointIds(),
    pendingGraduateRunpodEndpointIds(),
    activeEvaluationRunpodEndpointIds(now),
    activeCanaryRunpodEndpointIds(now),
  ])
  return new Set([...graduates, ...pendingGraduates, ...evaluations, ...canaries])
}