// saas/agent-gateway/circuit-breaker.ts
//
// Host-neutral, dependency-scoped circuit breaker primitives for the Universal Agent Gateway.
// This module classifies dependency health and admission only. It never executes provider,
// adapter, browser, infrastructure, or physical-system actions.

export type CircuitDependencyKind = 'provider' | 'adapter' | 'region' | 'model'
export type CircuitState = 'closed' | 'open' | 'half_open'
export type CircuitAdmissionDisposition = 'allow' | 'probe' | 'reject_dependency_only'

export interface CircuitBreakerKeyInput {
  tenantId: string
  environment: string
  kind: CircuitDependencyKind
  dependencyId: string
}

export interface CircuitBreakerSnapshot {
  schemaVersion: 'agent-gateway-circuit-breaker-v1'
  key: string
  tenantId: string
  environment: string
  kind: CircuitDependencyKind
  dependencyId: string
  state: CircuitState
  consecutiveFailures: number
  openedAt: string | null
  retryAfter: string | null
  probeInFlight: boolean
  lastFailureClass: string | null
  updatedAt: string
  readOnly: true
  executable: false
}

export interface CircuitBreakerPolicy {
  failureThreshold: number
  openDurationMs: number
}

export interface CircuitAdmission {
  schemaVersion: 'agent-gateway-circuit-admission-v1'
  key: string
  disposition: CircuitAdmissionDisposition
  reason: string
  state: CircuitState
  readOnly: true
  executable: false
}

export interface CircuitBreakerStore {
  get(key: string): Promise<CircuitBreakerSnapshot | null>
  put(snapshot: CircuitBreakerSnapshot): Promise<void>
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!IDENTIFIER.test(normalized)) throw new Error(`invalid circuit ${field}`)
  return normalized
}

function validNow(now: Date): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid circuit clock')
  return now
}

function validPolicy(policy: CircuitBreakerPolicy): CircuitBreakerPolicy {
  if (!Number.isSafeInteger(policy.failureThreshold) || policy.failureThreshold < 1 || policy.failureThreshold > 100) {
    throw new Error('invalid circuit failureThreshold')
  }
  if (!Number.isSafeInteger(policy.openDurationMs) || policy.openDurationMs < 1_000 || policy.openDurationMs > 900_000) {
    throw new Error('invalid circuit openDurationMs')
  }
  return policy
}

export function createCircuitBreakerKey(input: CircuitBreakerKeyInput): string {
  return [
    required(input.tenantId, 'tenantId'),
    required(input.environment, 'environment'),
    input.kind,
    required(input.dependencyId, 'dependencyId'),
  ].join(':')
}

export function createCircuitBreakerSnapshot(
  input: CircuitBreakerKeyInput,
  now = new Date(),
): CircuitBreakerSnapshot {
  const current = validNow(now).toISOString()
  return Object.freeze({
    schemaVersion: 'agent-gateway-circuit-breaker-v1',
    key: createCircuitBreakerKey(input),
    tenantId: required(input.tenantId, 'tenantId'),
    environment: required(input.environment, 'environment'),
    kind: input.kind,
    dependencyId: required(input.dependencyId, 'dependencyId'),
    state: 'closed',
    consecutiveFailures: 0,
    openedAt: null,
    retryAfter: null,
    probeInFlight: false,
    lastFailureClass: null,
    updatedAt: current,
    readOnly: true,
    executable: false,
  })
}

export function recordCircuitSuccess(snapshot: CircuitBreakerSnapshot, now = new Date()): CircuitBreakerSnapshot {
  const current = validNow(now).toISOString()
  return Object.freeze({ ...snapshot, state: 'closed', consecutiveFailures: 0, openedAt: null, retryAfter: null, probeInFlight: false, lastFailureClass: null, updatedAt: current, readOnly: true, executable: false })
}

export function recordCircuitFailure(snapshot: CircuitBreakerSnapshot, failureClass: string, policy: CircuitBreakerPolicy, now = new Date()): CircuitBreakerSnapshot {
  const current = validNow(now)
  const checked = validPolicy(policy)
  const failure = required(failureClass, 'failureClass')
  const consecutiveFailures = snapshot.consecutiveFailures + 1
  const shouldOpen = snapshot.state === 'half_open' || consecutiveFailures >= checked.failureThreshold
  return Object.freeze({ ...snapshot, state: shouldOpen ? 'open' : 'closed', consecutiveFailures, openedAt: shouldOpen ? current.toISOString() : snapshot.openedAt, retryAfter: shouldOpen ? new Date(current.getTime() + checked.openDurationMs).toISOString() : snapshot.retryAfter, probeInFlight: false, lastFailureClass: failure, updatedAt: current.toISOString(), readOnly: true, executable: false })
}

export function admitThroughCircuit(snapshot: CircuitBreakerSnapshot, now = new Date()): CircuitAdmission {
  const current = validNow(now)
  if (snapshot.state === 'closed') return Object.freeze({ schemaVersion: 'agent-gateway-circuit-admission-v1', key: snapshot.key, disposition: 'allow', reason: 'dependency circuit closed', state: 'closed', readOnly: true, executable: false })
  if (snapshot.state === 'open') {
    const retryAt = snapshot.retryAfter ? Date.parse(snapshot.retryAfter) : Number.NaN
    if (!Number.isFinite(retryAt)) throw new Error('invalid circuit retryAfter')
    if (retryAt > current.getTime()) return Object.freeze({ schemaVersion: 'agent-gateway-circuit-admission-v1', key: snapshot.key, disposition: 'reject_dependency_only', reason: 'dependency isolated until retry window', state: 'open', readOnly: true, executable: false })
    return Object.freeze({ schemaVersion: 'agent-gateway-circuit-admission-v1', key: snapshot.key, disposition: 'probe', reason: 'retry window reached; one bounded probe permitted', state: 'half_open', readOnly: true, executable: false })
  }
  return Object.freeze({ schemaVersion: 'agent-gateway-circuit-admission-v1', key: snapshot.key, disposition: snapshot.probeInFlight ? 'reject_dependency_only' : 'probe', reason: snapshot.probeInFlight ? 'half-open probe already in flight' : 'one bounded half-open probe permitted', state: 'half_open', readOnly: true, executable: false })
}

export function beginCircuitProbe(snapshot: CircuitBreakerSnapshot, now = new Date()): CircuitBreakerSnapshot {
  validNow(now)
  if (snapshot.state === 'closed') throw new Error('circuit probe not required')
  if (snapshot.probeInFlight) throw new Error('circuit probe already in flight')
  return Object.freeze({ ...snapshot, state: 'half_open', probeInFlight: true, updatedAt: now.toISOString(), readOnly: true, executable: false })
}

export class InMemoryCircuitBreakerStore implements CircuitBreakerStore {
  private readonly snapshots = new Map<string, CircuitBreakerSnapshot>()
  async get(key: string): Promise<CircuitBreakerSnapshot | null> { return this.snapshots.get(key) ?? null }
  async put(snapshot: CircuitBreakerSnapshot): Promise<void> { this.snapshots.set(snapshot.key, snapshot) }
}
