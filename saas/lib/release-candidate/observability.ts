export interface ObservabilityInput {
  readonly telemetryCoverage: number
  readonly alertCoverage: number
  readonly traceCoverage: number
  readonly dashboardsAvailable: boolean
  readonly auditSinkAvailable: boolean
  readonly minCoverage: number
}

export interface ObservabilityResult {
  readonly pass: boolean
  readonly reasons: readonly string[]
}

export function evaluateObservability(input: ObservabilityInput): ObservabilityResult {
  for (const value of [input.telemetryCoverage, input.alertCoverage, input.traceCoverage, input.minCoverage]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('invalid_observability_coverage')
  }

  const reasons: string[] = []
  if (input.telemetryCoverage < input.minCoverage) reasons.push('telemetry_coverage_below_threshold')
  if (input.alertCoverage < input.minCoverage) reasons.push('alert_coverage_below_threshold')
  if (input.traceCoverage < input.minCoverage) reasons.push('trace_coverage_below_threshold')
  if (!input.dashboardsAvailable) reasons.push('operational_dashboards_unavailable')
  if (!input.auditSinkAvailable) reasons.push('audit_sink_unavailable')

  return Object.freeze({ pass: reasons.length === 0, reasons: Object.freeze(reasons.sort()) })
}
