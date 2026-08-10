export interface LoadProfileInput {
  readonly concurrentTenants: number
  readonly requestsPerSecond: number
  readonly p95LatencyMs: number
  readonly errorRate: number
  readonly durationMinutes: number
  readonly maxConcurrentTenants: number
  readonly maxP95LatencyMs: number
  readonly maxErrorRate: number
  readonly minDurationMinutes: number
}

export interface LoadProfileResult {
  readonly pass: boolean
  readonly reasons: readonly string[]
  readonly utilization: number
}

export function evaluateLoadProfile(input: LoadProfileInput): LoadProfileResult {
  const numeric = Object.values(input)
  if (numeric.some(value => !Number.isFinite(value) || value < 0)) throw new Error('invalid_load_profile')
  if (input.maxConcurrentTenants < 1 || input.maxP95LatencyMs < 1 || input.minDurationMinutes < 1) throw new Error('invalid_load_threshold')
  if (input.errorRate > 1 || input.maxErrorRate > 1) throw new Error('invalid_error_rate')

  const reasons: string[] = []
  if (input.concurrentTenants > input.maxConcurrentTenants) reasons.push('concurrent_tenant_limit_exceeded')
  if (input.p95LatencyMs > input.maxP95LatencyMs) reasons.push('p95_latency_exceeded')
  if (input.errorRate > input.maxErrorRate) reasons.push('error_rate_exceeded')
  if (input.durationMinutes < input.minDurationMinutes) reasons.push('duration_below_required_soak')
  if (input.requestsPerSecond <= 0) reasons.push('no_sustained_request_load')

  return Object.freeze({
    pass: reasons.length === 0,
    reasons: Object.freeze(reasons.sort()),
    utilization: Math.min(1, input.concurrentTenants / input.maxConcurrentTenants),
  })
}
