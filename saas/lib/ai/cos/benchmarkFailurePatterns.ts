// saas/lib/ai/cos/benchmarkFailurePatterns.ts

export type BenchmarkResultRow = {
  case_id?: string | null
  track?: string | null
  passed?: boolean | null
  reasons?: unknown
  response_source?: string | null
  local_model_invoked?: boolean | null
  external_ai_invoked?: boolean | null
  created_at?: string | null
}

export type FailureClass = 'capability' | 'run_condition' | 'execution_error'

export type ReasonPattern = {
  reason: string
  failureClass: FailureClass
  occurrences: number
  distinctCases: number
  caseIds: string[]
}

export type CaseHealth = {
  caseId: string
  track: string
  attempts: number
  passes: number
  capabilityFailures: number
  runConditionFailures: number
  verdict: 'never_passed' | 'flaky' | 'reliable' | 'insufficient_attempts'
  persistentReasons: string[]
  guidance: string
}

export type BenchmarkFailureReport = {
  generatedAt: string
  attempts: number
  passes: number
  rawPassRate: number | null
  capabilityEligibleAttempts: number
  capabilityPassRate: number | null
  runConditionFailures: number
  executionErrors: number
  reasonPatterns: ReasonPattern[]
  caseHealth: CaseHealth[]
  findings: string[]
  summary: string
}

const RUN_CONDITION_REASONS = new Set([
  'external_ai_used',
  'semantic_cache_used',
  'local_reasoning_not_recorded',
  'missing_provenance',
  'case_id_mismatch',
])

export const MINIMUM_ATTEMPTS_FOR_VERDICT = 3

function clean(value: unknown, max = 200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function reasonsOf(row: BenchmarkResultRow): string[] {
  if (!Array.isArray(row.reasons)) return []
  return row.reasons.map(reason => clean(reason, 300)).filter(Boolean)
}

export function classifyReason(reason: string): FailureClass {
  const normalized = clean(reason, 300)
  if (normalized === 'case_execution_failed') return 'execution_error'
  if (RUN_CONDITION_REASONS.has(normalized)) return 'run_condition'
  if (normalized.startsWith('missing:') || normalized.startsWith('forbidden:')) return 'capability'
  return 'execution_error'
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

export function analyzeBenchmarkFailures(rows: BenchmarkResultRow[], options: { now?: Date } = {}): BenchmarkFailureReport {
  const now = options.now ?? new Date()
  const results = (Array.isArray(rows) ? rows : []).map(row => {
    const reasons = reasonsOf(row)
    const classes = new Set(reasons.map(classifyReason))
    return {
      caseId: clean(row.case_id, 80) || 'unknown',
      track: clean(row.track, 80) || 'unknown',
      passed: row.passed === true,
      reasons,
      hasRunCondition: classes.has('run_condition'),
      hasExecutionError: classes.has('execution_error'),
      hasCapability: classes.has('capability'),
    }
  })

  const attempts = results.length
  const passes = results.filter(result => result.passed).length
  const runConditionFailures = results.filter(result => !result.passed && result.hasRunCondition).length
  const executionErrors = results.filter(result => !result.passed && result.hasExecutionError && !result.hasRunCondition).length
  const capabilityEligible = results.filter(result => result.passed || (!result.hasRunCondition && !result.hasExecutionError))
  const capabilityPasses = capabilityEligible.filter(result => result.passed).length

  const patternMap = new Map<string, { failureClass: FailureClass; occurrences: number; caseIds: Set<string> }>()
  for (const result of results) {
    if (result.passed) continue
    for (const reason of result.reasons) {
      const key = reason.startsWith('case_execution_failed') ? 'case_execution_failed' : reason
      const existing = patternMap.get(key)
      if (existing) {
        existing.occurrences += 1
        existing.caseIds.add(result.caseId)
      } else {
        patternMap.set(key, { failureClass: classifyReason(key), occurrences: 1, caseIds: new Set([result.caseId]) })
      }
    }
  }

  const reasonPatterns: ReasonPattern[] = [...patternMap.entries()]
    .map(([reason, value]) => ({
      reason,
      failureClass: value.failureClass,
      occurrences: value.occurrences,
      distinctCases: value.caseIds.size,
      caseIds: [...value.caseIds].slice(0, 20),
    }))
    .sort((a, b) => b.occurrences - a.occurrences)

  const byCase = new Map<string, typeof results>()
  for (const result of results) {
    const existing = byCase.get(result.caseId)
    if (existing) existing.push(result)
    else byCase.set(result.caseId, [result])
  }

  const caseHealth: CaseHealth[] = [...byCase.entries()].map(([caseId, caseResults]) => {
    const caseAttempts = caseResults.length
    const casePasses = caseResults.filter(result => result.passed).length
    const capabilityFailures = caseResults.filter(result => !result.passed && result.hasCapability && !result.hasRunCondition).length
    const caseRunConditionFailures = caseResults.filter(result => !result.passed && result.hasRunCondition).length
    const capabilityFailureRuns = caseResults.filter(result => !result.passed && result.hasCapability)
    const persistentReasons = capabilityFailureRuns.length > 0
      ? capabilityFailureRuns[0].reasons
        .filter(reason => classifyReason(reason) === 'capability')
        .filter(reason => capabilityFailureRuns.every(run => run.reasons.includes(reason)))
      : []

    let verdict: CaseHealth['verdict']
    if (caseAttempts < MINIMUM_ATTEMPTS_FOR_VERDICT) verdict = 'insufficient_attempts'
    else if (casePasses === 0) verdict = 'never_passed'
    else if (casePasses === caseAttempts) verdict = 'reliable'
    else verdict = 'flaky'

    const guidance = caseRunConditionFailures > 0 && capabilityFailures === 0
      ? 'Every failure was a run-condition failure. Nothing here is a capability signal — check the reasoner pod, the cache bypass and the external-provider policy before touching the prompt.'
      : verdict === 'never_passed' && persistentReasons.length > 0
        ? `Fails on the same criteria every time (${persistentReasons.join(', ')}). Two possible causes and they need opposite fixes: a genuine blind spot, or a required term that no correct answer would naturally contain. Read the stored response excerpt before changing the system prompt.`
        : verdict === 'flaky'
          ? 'Passes sometimes. Non-determinism at this level usually means the required terms are too specific to one phrasing rather than to the substance.'
          : verdict === 'reliable'
            ? 'Passing consistently.'
            : 'Not enough attempts to judge.'

    return {
      caseId,
      track: caseResults[0].track,
      attempts: caseAttempts,
      passes: casePasses,
      capabilityFailures,
      runConditionFailures: caseRunConditionFailures,
      verdict,
      persistentReasons,
      guidance,
    }
  }).sort((a, b) => a.passes / Math.max(1, a.attempts) - b.passes / Math.max(1, b.attempts))

  const findings: string[] = []
  if (attempts === 0) {
    findings.push('No benchmark results recorded. There is nothing to analyze — this is not a passing check.')
  } else {
    if (runConditionFailures > 0) {
      findings.push(`${runConditionFailures} of ${attempts} attempts failed on run conditions rather than answer quality. Those attempts tested infrastructure, not capability, and the raw pass rate understates COS by that much.`)
    }
    if (executionErrors > 0) {
      findings.push(`${executionErrors} attempts threw before producing an answer. Read the stored excerpt and reasons; an error is not a wrong answer.`)
    }
    const neverPassed = caseHealth.filter(entry => entry.verdict === 'never_passed')
    if (neverPassed.length > 0) {
      findings.push(`${neverPassed.length} case(s) have never passed across at least ${MINIMUM_ATTEMPTS_FOR_VERDICT} attempts: ${neverPassed.map(entry => entry.caseId).slice(0, 10).join(', ')}. Check the rubric wording before concluding it is a blind spot.`)
    }
    const flaky = caseHealth.filter(entry => entry.verdict === 'flaky')
    if (flaky.length > 0) {
      findings.push(`${flaky.length} case(s) pass inconsistently. Required terms pinned to one phrasing produce exactly this.`)
    }
    if (capabilityEligible.length === 0) {
      findings.push('NOT ONE attempt ran under valid conditions, so there is no capability measurement at all here — only an infrastructure report.')
    }
  }

  const rawPassRate = attempts > 0 ? roundTo(passes / attempts, 4) : null
  const capabilityPassRate = capabilityEligible.length > 0 ? roundTo(capabilityPasses / capabilityEligible.length, 4) : null
  const summary = attempts === 0
    ? 'NO DATA — no benchmark results to analyze.'
    : capabilityPassRate === null
      ? `${attempts} attempts, none of which ran under valid conditions. No capability rate can be stated.`
      : `Raw ${roundTo((rawPassRate ?? 0) * 100, 1)}% over ${attempts} attempts; capability ${roundTo(capabilityPassRate * 100, 1)}% over the ${capabilityEligible.length} attempts that actually tested reasoning.`

  return {
    generatedAt: now.toISOString(),
    attempts,
    passes,
    rawPassRate,
    capabilityEligibleAttempts: capabilityEligible.length,
    capabilityPassRate,
    runConditionFailures,
    executionErrors,
    reasonPatterns,
    caseHealth,
    findings,
    summary,
  }
}
