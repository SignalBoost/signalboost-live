export const REFERENCE_DIAGNOSTIC_AGENT_ID = 'signalboost-reference-self-healing-diagnostic' as const
export const REFERENCE_DIAGNOSTIC_SKILL_ID = 'self-healing.diagnose' as const

export interface ReferenceDiagnosticResult {
  classification: string
  confidence: number
  evidenceSignals: readonly string[]
  recommendedNextChecks: readonly string[]
}

const RULES = Object.freeze([
  { id: 'authentication_or_authorization', pattern: /\b(?:401|403|unauthorized|forbidden|oauth|token|credential|permission)\b/i, checks: ['Verify the caller identity and exact permission scope.', 'Confirm token/session validity without exposing credentials.', 'Check whether the failing operation recently changed authorization policy.'] },
  { id: 'upstream_timeout_or_network', pattern: /\b(?:timeout|timed out|504|gateway timeout|etimedout|econnreset|connection reset|dns|network)\b/i, checks: ['Measure upstream latency and error rate for the same time window.', 'Check dependency health and network path before changing application code.', 'Compare timeout budgets across caller, proxy, and upstream service.'] },
  { id: 'datastore_or_query', pattern: /\b(?:postgres|postgresql|supabase|database|sql|query|deadlock|connection pool|pgrst)\b/i, checks: ['Inspect datastore health, connection-pool saturation, and query latency.', 'Correlate the failing request with database logs using the same trace/time window.', 'Verify schema/migration state before applying code changes.'] },
  { id: 'resource_exhaustion', pattern: /\b(?:oom|out of memory|memory limit|heap|cpu limit|resource exhausted|disk full)\b/i, checks: ['Measure resource saturation at failure time.', 'Identify whether load, leak, or workload size changed before increasing limits.', 'Verify restart/scale behavior and preserve evidence before remediation.'] },
  { id: 'build_or_release', pattern: /\b(?:build failed|compile|typecheck|typescript|deployment failed|deploy failed|module not found|cannot find module)\b/i, checks: ['Reproduce the exact failing build or typecheck command.', 'Identify the first failing file/module rather than downstream errors.', 'Compare dependency lockfile and runtime versions with the last passing release.'] },
  { id: 'application_runtime', pattern: /\b(?:500|internal server error|typeerror|referenceerror|exception|stack trace|crash)\b/i, checks: ['Capture the first application exception and trace identifier.', 'Separate the originating exception from secondary retry/proxy failures.', 'Reproduce with the smallest request that preserves the same failure.'] },
])

export function diagnoseReferenceIncident(text: string): ReferenceDiagnosticResult {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length < 8) throw new Error('reference_diagnostic_incident_text_too_short')
  if (normalized.length > 32_000) throw new Error('reference_diagnostic_incident_text_too_large')

  const matched = RULES.filter(rule => rule.pattern.test(normalized))
  if (matched.length === 0) {
    return Object.freeze({
      classification: 'insufficient_signal',
      confidence: 0.25,
      evidenceSignals: Object.freeze([]),
      recommendedNextChecks: Object.freeze([
        'Provide the exact error/status and the component that emitted it.',
        'Provide the failing request or operation boundary and timestamp.',
        'Provide one correlated log, metric, or trace before selecting a remediation.',
      ]),
    })
  }

  const primary = matched[0]!
  return Object.freeze({
    classification: primary.id,
    confidence: Math.min(0.95, 0.62 + (matched.length - 1) * 0.08),
    evidenceSignals: Object.freeze(matched.map(rule => rule.id)),
    recommendedNextChecks: Object.freeze(primary.checks),
  })
}

export function referenceDiagnosticArtifactText(text: string): string {
  const result = diagnoseReferenceIncident(text)
  return JSON.stringify({
    specialist: REFERENCE_DIAGNOSTIC_AGENT_ID,
    skill: REFERENCE_DIAGNOSTIC_SKILL_ID,
    advisoryOnly: true,
    ...result,
  })
}
