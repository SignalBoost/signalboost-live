// saas/lib/ai/cos/cosUniversityGraduateEndpointProtection.ts
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

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


type AssuranceEndpointEvent = Readonly<{
  candidate_id?: unknown
  observed_at?: unknown
  evidence?: unknown
}>

const EVALUATION_PROFILE = 'cos_mass_distilled_independent_evaluation_runtime_v1'
const CANARY_PROFILE = 'cos_local_distilled_runtime_deploy_v1'
const EVALUATION_STARTED = 'mass_distilled_independent_evaluation_started'
const EVALUATION_TERMINAL = new Set([
  'mass_distilled_independent_evaluation_completed',
  'mass_distilled_independent_evaluation_failed',
])
const CANARY_STARTED = 'local_distilled_runtime_canary_invocation_started'
const CANARY_TERMINAL = new Set([
  'local_distilled_runtime_canary_passed',
  'local_distilled_runtime_canary_failed',
])
const EVALUATION_PROTECTION_TTL_MS = 12 * 60 * 1000
const CANARY_PROTECTION_TTL_MS = 10 * 60 * 1000

function eventEvidence(row: AssuranceEndpointEvent): Record<string, unknown> {
  const value = row?.evidence
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function eventAt(row: AssuranceEndpointEvent): number {
  return Date.parse(String(row?.observed_at || ''))
}

function eventEndpointId(row: AssuranceEndpointEvent): string | null {
  const value = String(eventEvidence(row).endpointId || '').trim().toLowerCase()
  return ENDPOINT_ID.test(value) ? value : null
}

function hasTerminalAfter(
  rows: readonly AssuranceEndpointEvent[],
  started: AssuranceEndpointEvent,
  terminalClaims: ReadonlySet<string>,
): boolean {
  const evidence = eventEvidence(started)
  const candidateId = String(started?.candidate_id || '')
  const artifactHash = String(evidence.artifactHash || '').toLowerCase()
  const endpointId = eventEndpointId(started)
  const startedAt = eventAt(started)
  return rows.some(row => {
    if (String(row?.candidate_id || '') !== candidateId) return false
    const rowEvidence = eventEvidence(row)
    if (artifactHash && String(rowEvidence.artifactHash || '').toLowerCase() !== artifactHash) return false
    if (endpointId && eventEndpointId(row) && eventEndpointId(row) !== endpointId) return false
    return terminalClaims.has(String(rowEvidence.claim || '')) && eventAt(row) >= startedAt
  })
}

/**
 * Capacity reclamation must not evict endpoints that are actively serving a governed University
 * canary/evaluation. The provider worker quota is shared across those lanes, and reclaiming one
 * endpoint while another long-running readiness wait owns it creates a self-inflicted network/204
 * failure. This is operational protection only; it grants no inference, evaluation, promotion or
 * Production-traffic authority.
 */
export async function protectedMassDistilledRunpodEndpointIds(nowMs = Date.now()): Promise<ReadonlySet<string>> {
  const ids = new Set(await activeGraduateRunpodEndpointIds())
  const db = cosServiceDb()
  if (!db) throw new Error('graduate_endpoint_protection_database_unavailable')
  const since = new Date(nowMs - Math.max(EVALUATION_PROTECTION_TTL_MS, CANARY_PROTECTION_TTL_MS) - 60_000).toISOString()
  const events = await db.from('cos_university_learning_assurance_events')
    .select('candidate_id,observed_at,evidence')
    .eq('event_type', 'fine_tune')
    .gte('observed_at', since)
    .in('verifier', ['host_controller', 'host_production_verifier'])
    .order('observed_at', { ascending: false })
    .limit(1000)
  if (events.error) throw events.error

  const rows = (events.data || []) as AssuranceEndpointEvent[]
  for (const row of rows) {
    const evidence = eventEvidence(row)
    const profile = String(evidence.profile || '')
    const claim = String(evidence.claim || '')
    const endpointId = eventEndpointId(row)
    const observedAt = eventAt(row)
    if (!endpointId || !Number.isFinite(observedAt)) continue

    if (profile === EVALUATION_PROFILE && claim === EVALUATION_STARTED) {
      if (nowMs - observedAt < EVALUATION_PROTECTION_TTL_MS
        && !hasTerminalAfter(rows, row, EVALUATION_TERMINAL)) ids.add(endpointId)
      continue
    }
    if (profile === CANARY_PROFILE && claim === CANARY_STARTED) {
      if (nowMs - observedAt < CANARY_PROTECTION_TTL_MS
        && !hasTerminalAfter(rows, row, CANARY_TERMINAL)) ids.add(endpointId)
    }
  }
  return ids
}
