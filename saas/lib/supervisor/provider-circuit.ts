// saas/lib/supervisor/provider-circuit.ts
import { createHash } from 'node:crypto'

export const PROVIDER_CIRCUIT_PROFILE = 'self-healing-provider-circuit-v1' as const

export type ProviderFailureClass =
  | 'capacity_exhausted'
  | 'billing_exhausted'
  | 'authentication_failed'
  | 'authorization_failed'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'configuration_invalid'
  | 'request_invalid'
  | 'transient_transport'
  | 'unknown'

export type ProviderFailureDisposition = 'open_circuit' | 'backoff' | 'retry_bounded' | 'protected_halt'

export type ProviderFailureClassification = Readonly<{
  failureClass: ProviderFailureClass
  disposition: ProviderFailureDisposition
  deterministic: boolean
  costBearingRetryAllowed: boolean
  reason: string
}>

const RULES: ReadonlyArray<readonly [RegExp, ProviderFailureClassification]> = [
  [/private repository storage limit reached|storage (?:quota|limit).*(?:reached|exceeded)|insufficient storage/i,
    { failureClass: 'capacity_exhausted', disposition: 'open_circuit', deterministic: true, costBearingRetryAllowed: false, reason: 'provider_storage_capacity_exhausted' }],
  [/insufficient (?:credit|funds)|billing.*(?:limit|disabled|exhausted)|payment required|quota.*billing/i,
    { failureClass: 'billing_exhausted', disposition: 'open_circuit', deterministic: true, costBearingRetryAllowed: false, reason: 'provider_billing_capacity_exhausted' }],
  [/invalid.*(?:token|api key)|unauthenticated|authentication failed|\b401\b/i,
    { failureClass: 'authentication_failed', disposition: 'open_circuit', deterministic: true, costBearingRetryAllowed: false, reason: 'provider_authentication_failed' }],
  [/permission denied|forbidden|not authorized|authorization failed|\b403\b/i,
    { failureClass: 'authorization_failed', disposition: 'open_circuit', deterministic: true, costBearingRetryAllowed: false, reason: 'provider_authorization_failed' }],
  // OUR OWN WORKER'S FAULT, NOT THE PROVIDER'S (widened 2026-09-28).
  // The caller refuses to open a provider circuit when reason === 'worker_contract_invalid', which is
  // correct: a defect in a script we wrote and serve says nothing about the provider's health. The rule
  // was too narrow to reach that branch. It required /tmp/itmounts_hf_worker.py AND one of three
  // exception names, so a ValueError raised inside itmounts_hf_worker_base.py fell through to 'unknown'
  // and opened a permanent cost-blocking breaker against HuggingFace. Production 2026-09-20 to 09-28:
  // prepare_dataset pushed a DatasetDict whose splits had mismatched features; every preparation job
  // exited 1, the breaker blamed the provider, and the University produced one graduate in nine days.
  // The worker emits a stable 'itmounts_hf_worker_error:<Type>:' prefix and both worker files appear in
  // its traceback; either is sufficient proof the failure is ours.
  [/itmounts_hf_worker_error:|\/tmp\/itmounts_hf_worker(?:_base)?\.py/i,
    { failureClass: 'configuration_invalid', disposition: 'protected_halt', deterministic: true, costBearingRetryAllowed: false, reason: 'worker_contract_invalid' }],
  [/rate.?limit|too many requests|\b429\b/i,
    { failureClass: 'rate_limited', disposition: 'backoff', deterministic: false, costBearingRetryAllowed: false, reason: 'provider_rate_limited' }],
  [/service unavailable|provider unavailable|\b50[234]\b/i,
    { failureClass: 'provider_unavailable', disposition: 'backoff', deterministic: false, costBearingRetryAllowed: false, reason: 'provider_unavailable' }],
  [/invalid configuration|configuration.*missing|repository.*not found|invalid repository/i,
    { failureClass: 'configuration_invalid', disposition: 'open_circuit', deterministic: true, costBearingRetryAllowed: false, reason: 'provider_configuration_invalid' }],
  [/bad request|invalid request|\b400\b/i,
    { failureClass: 'request_invalid', disposition: 'protected_halt', deterministic: true, costBearingRetryAllowed: false, reason: 'provider_request_invalid' }],
  [/timeout|timed out|connection reset|network error|temporary failure/i,
    { failureClass: 'transient_transport', disposition: 'retry_bounded', deterministic: false, costBearingRetryAllowed: true, reason: 'provider_transient_transport' }],
]

export function classifyProviderFailure(lines: readonly string[]): ProviderFailureClassification {
  const text = lines.join('\n').slice(-50_000)
  for (const [pattern, classification] of RULES) if (pattern.test(text)) return classification
  return {
    failureClass: 'unknown',
    disposition: 'protected_halt',
    deterministic: false,
    costBearingRetryAllowed: false,
    reason: 'provider_failure_unclassified',
  }
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function openProviderCircuit(input: {
  db: any
  providerId: string
  capability: string
  classification: ProviderFailureClassification
  evidence?: Record<string, unknown>
  now?: Date
}) {
  if (input.classification.disposition === 'retry_bounded') {
    return { opened: false as const, reason: 'bounded_retry_permitted' as const }
  }
  const now = (input.now || new Date()).toISOString()
  const providerId = String(input.providerId || '').trim().toLowerCase()
  const capability = String(input.capability || '').trim().toLowerCase()
  if (!providerId || !capability) throw new Error('provider_circuit_identity_invalid')
  const evidence = {
    profile: PROVIDER_CIRCUIT_PROFILE,
    providerId,
    capability,
    classification: input.classification,
    ...(input.evidence || {}),
  }
  const row = {
    provider_id: providerId,
    capability,
    state: 'open',
    failure_class: input.classification.failureClass,
    reason: input.classification.reason,
    cost_bearing_retry_allowed: false,
    opened_at: now,
    last_observed_at: now,
    evidence_hash: digest(evidence),
    evidence,
  }
  const result = await input.db.from('self_healing_provider_circuits').upsert(row, { onConflict: 'provider_id,capability' })
  if (result.error) throw result.error
  return { opened: true as const, providerId, capability, classification: input.classification }
}

/**
 * An UNCLASSIFIED failure expires on its own.
 *
 * classifyProviderFailure() returns 'unknown' when no rule matches, and openProviderCircuit() opens a
 * cost-blocking breaker on it anyway. But an unrecognised error is evidence that the CLASSIFIER has a
 * gap, not that the provider is unhealthy — and the only recovery probe that exists arms solely for
 * capacity_exhausted/provider_storage_capacity_exhausted, so every other class, 'unknown' included, had
 * no path back to closed. Production 2026-09-28: a breaker opened at 02:57 on an unclassified failure
 * and was still blocking the whole University pipeline hours later, surviving two manual closes.
 *
 * A classified failure still halts indefinitely — when we know the provider is out of credit or the
 * token is invalid, retrying costs money and cannot succeed. An unclassified one now becomes a DELAY:
 * it stops being honoured after the TTL and the next tick re-probes for real. Deliberately implemented
 * as read-time expiry rather than a new 'half_open' state, because the table's CHECK constraint permits
 * only 'open' and 'closed' — the existing half_open_probe_armed write cannot persist against it.
 */
const UNCLASSIFIED_CIRCUIT_TTL_MS = 30 * 60 * 1000

function unclassifiedCircuitTtlMs(): number {
  const parsed = Number(process.env.PROVIDER_CIRCUIT_UNCLASSIFIED_TTL_MS)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : UNCLASSIFIED_CIRCUIT_TTL_MS
}

/** True once an 'unknown' circuit has outlived its TTL and must no longer block work. */
export function unclassifiedCircuitExpired(
  row: { failure_class?: unknown; reason?: unknown; opened_at?: unknown },
  now: number = Date.now(),
): boolean {
  const failureClass = String(row.failure_class || '').trim().toLowerCase()
  const reason = String(row.reason || '').trim().toLowerCase()
  if (failureClass !== 'unknown' && reason !== 'provider_failure_unclassified') return false
  const openedAt = Date.parse(String(row.opened_at || ''))
  if (!Number.isFinite(openedAt)) return false
  return now - openedAt >= unclassifiedCircuitTtlMs()
}

export async function readProviderCircuit(input: { db: any; providerId: string; capability: string }) {
  const result = await input.db.from('self_healing_provider_circuits')
    .select('state,failure_class,reason,cost_bearing_retry_allowed,opened_at,last_observed_at')
    .eq('provider_id', String(input.providerId || '').trim().toLowerCase())
    .eq('capability', String(input.capability || '').trim().toLowerCase())
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data || result.data.state !== 'open') return { open: false as const }
  if (unclassifiedCircuitExpired(result.data)) {
    console.warn('[provider_circuit_unclassified_expired]', JSON.stringify({
      providerId: String(input.providerId || '').trim().toLowerCase(),
      capability: String(input.capability || '').trim().toLowerCase(),
      openedAt: String(result.data.opened_at || ''),
      ttlMs: unclassifiedCircuitTtlMs(),
    }))
    return { open: false as const }
  }
  return {
    open: true as const,
    failureClass: String(result.data.failure_class || 'unknown'),
    reason: String(result.data.reason || 'provider_circuit_open'),
    costBearingRetryAllowed: result.data.cost_bearing_retry_allowed === true,
    openedAt: result.data.opened_at,
    lastObservedAt: result.data.last_observed_at,
  }
}

export async function armProviderCircuitRecoveryProbe(input: {
  db: any
  providerId: string
  capability: string
  expectedFailureClass: ProviderFailureClass
  expectedReason: string
  verification: Record<string, unknown>
  now?: Date
}) {
  const now = (input.now || new Date()).toISOString()
  const providerId = String(input.providerId || '').trim().toLowerCase()
  const capability = String(input.capability || '').trim().toLowerCase()
  const expectedReason = String(input.expectedReason || '').trim()
  if (!providerId || !capability || !expectedReason) throw new Error('provider_circuit_identity_invalid')
  const result = await input.db.from('self_healing_provider_circuits').update({
    failure_class: input.expectedFailureClass,
    reason: expectedReason,
    cost_bearing_retry_allowed: true,
    last_observed_at: now,
    recovery_verification: {
      profile: PROVIDER_CIRCUIT_PROFILE,
      state: 'half_open_probe_armed',
      providerId,
      capability,
      ...input.verification,
      armedAt: now,
    },
  })
    .eq('provider_id', providerId)
    .eq('capability', capability)
    .eq('state', 'open')
    .eq('cost_bearing_retry_allowed', false)
    .select('provider_id,capability,failure_class,reason')
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) return { armed: false as const, reason: 'provider_circuit_not_armable' as const }
  return { armed: true as const, providerId, capability, failureClass: input.expectedFailureClass, reason: expectedReason }
}

export async function consumeProviderCircuitRecoveryProbe(input: {
  db: any
  providerId: string
  capability: string
  verification?: Record<string, unknown>
  now?: Date
}) {
  const now = (input.now || new Date()).toISOString()
  const providerId = String(input.providerId || '').trim().toLowerCase()
  const capability = String(input.capability || '').trim().toLowerCase()
  if (!providerId || !capability) throw new Error('provider_circuit_identity_invalid')
  const result = await input.db.from('self_healing_provider_circuits').update({
    cost_bearing_retry_allowed: false,
    last_observed_at: now,
    recovery_verification: {
      profile: PROVIDER_CIRCUIT_PROFILE,
      state: 'half_open_probe_claimed',
      providerId,
      capability,
      ...(input.verification || {}),
      claimedAt: now,
    },
  })
    .eq('provider_id', providerId)
    .eq('capability', capability)
    .eq('state', 'open')
    .eq('cost_bearing_retry_allowed', true)
    .select('provider_id,capability,failure_class,reason')
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) return { claimed: false as const }
  return {
    claimed: true as const,
    providerId,
    capability,
    failureClass: String(result.data.failure_class || 'unknown'),
    reason: String(result.data.reason || 'provider_circuit_open'),
  }
}

export async function closeProviderCircuit(input: {
  db: any
  providerId: string
  capability: string
  verification: Record<string, unknown>
  now?: Date
}) {
  const now = (input.now || new Date()).toISOString()
  const result = await input.db.from('self_healing_provider_circuits').update({
    state: 'closed',
    closed_at: now,
    last_observed_at: now,
    recovery_verification: input.verification,
  })
    .eq('provider_id', String(input.providerId || '').trim().toLowerCase())
    .eq('capability', String(input.capability || '').trim().toLowerCase())
    .eq('state', 'open')
  if (result.error) throw result.error
  return { closed: true as const }
}
