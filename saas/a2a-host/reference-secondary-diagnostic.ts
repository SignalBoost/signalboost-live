export const SECONDARY_REFERENCE_DIAGNOSTIC_AGENT_ID = 'signalboost-reference-self-healing-verification-diagnostic' as const
export const SECONDARY_REFERENCE_DIAGNOSTIC_SKILL_ID = 'self-healing.diagnose' as const

export interface SecondaryReferenceDiagnosticResult {
  classification: string
  confidence: number
  evidenceSignals: readonly string[]
  recommendedNextChecks: readonly string[]
}

type Rule = Readonly<{
  id: string
  tests: readonly RegExp[]
  checks: readonly string[]
}>

const RULES: readonly Rule[] = Object.freeze([
  Object.freeze({
    id: 'upstream_timeout_or_network',
    tests: Object.freeze([/\b504\b/i, /\bgateway timeout\b/i, /\bupstream\b.*\b(?:latency|timeout)\b/i, /\b(?:econnreset|etimedout|dns|network)\b/i]),
    checks: Object.freeze(['Correlate upstream latency and error rate with the failing request window.', 'Compare caller, proxy, and dependency timeout budgets.', 'Verify dependency and network-path health before changing application logic.']),
  }),
  Object.freeze({
    id: 'authentication_or_authorization',
    tests: Object.freeze([/\b(?:401|403|unauthorized|forbidden)\b/i, /\b(?:oauth|token|permission|credential)\b/i]),
    checks: Object.freeze(['Verify the caller identity and exact authorization scope.', 'Check token or session validity without exposing credential material.', 'Compare the failing policy decision with the last known-good authorization state.']),
  }),
  Object.freeze({
    id: 'datastore_or_query',
    tests: Object.freeze([/\b(?:postgres|supabase|database|sql|deadlock|pgrst)\b/i, /\bconnection pool\b/i]),
    checks: Object.freeze(['Inspect datastore availability, pool pressure, and query latency.', 'Correlate the failing operation with database logs or traces.', 'Verify migration and schema state before code remediation.']),
  }),
  Object.freeze({
    id: 'build_or_release',
    tests: Object.freeze([/\b(?:build failed|compile|typescript|module not found|deployment failed|deploy failed)\b/i]),
    checks: Object.freeze(['Reproduce the exact failing build or release command.', 'Identify the first originating error rather than downstream failures.', 'Compare dependency and runtime versions with the last passing release.']),
  }),
  Object.freeze({
    id: 'application_runtime',
    tests: Object.freeze([/\b(?:500|internal server error|typeerror|referenceerror|exception|stack trace|crash)\b/i]),
    checks: Object.freeze(['Capture the first application exception and trace identifier.', 'Separate the originating exception from retry or proxy symptoms.', 'Reproduce with the smallest request that preserves the same failure.']),
  }),
])

export function diagnoseSecondaryReferenceIncident(text: string): SecondaryReferenceDiagnosticResult {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length < 8) throw new Error('secondary_reference_diagnostic_incident_text_too_short')
  if (normalized.length > 32_000) throw new Error('secondary_reference_diagnostic_incident_text_too_large')

  const scored = RULES.map(rule => ({ rule, score: rule.tests.reduce((count, test) => count + (test.test(normalized) ? 1 : 0), 0) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id))

  if (!scored.length) {
    return Object.freeze({
      classification: 'insufficient_signal',
      confidence: 0.3,
      evidenceSignals: Object.freeze([]),
      recommendedNextChecks: Object.freeze(['Provide the exact status or exception.', 'Provide the failing operation boundary and timestamp.', 'Provide one correlated metric, trace, or log before remediation.']),
    })
  }

  const primary = scored[0]!
  return Object.freeze({
    classification: primary.rule.id,
    confidence: Math.min(0.96, 0.58 + primary.score * 0.09 + Math.min(0.12, (scored.length - 1) * 0.04)),
    evidenceSignals: Object.freeze(scored.map(item => item.rule.id)),
    recommendedNextChecks: primary.rule.checks,
  })
}

export function secondaryReferenceDiagnosticArtifactText(text: string): string {
  const result = diagnoseSecondaryReferenceIncident(text)
  return JSON.stringify({
    specialist: SECONDARY_REFERENCE_DIAGNOSTIC_AGENT_ID,
    skill: SECONDARY_REFERENCE_DIAGNOSTIC_SKILL_ID,
    advisoryOnly: true,
    ...result,
  })
}
