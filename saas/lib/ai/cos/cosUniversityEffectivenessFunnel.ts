// saas/lib/ai/cos/cosUniversityEffectivenessFunnel.ts
//
// The Artifact Effectiveness Funnel: the same cohort of artifacts counted through every stage of its life, from the
// tables, never from a dashboard counter. Page one of the buyer-facing proof.
//
// Owner, 2026-10-04: the report is a feature of the portable, generated from the deployment's own records, so the
// seller shows real numbers and the buyer gets the same report on their own infrastructure on day one. Every row
// names its source table. A figure that cannot be sourced is not printed.
//
// Cohort = artifacts REGISTERED in the window (born). Downstream stages are read for that cohort wherever they
// happened in time, because a graduate born on Monday graduates on Wednesday: filtering downstream tables by the
// window would hide the funnel's own bottom. Honesty rows: rejected artifacts by status, and evaluation failures split
// by the SAME infrastructure-vs-merit rule the rolling authority applies (one classifier, one answer).
//
// The store is injected (PostgREST-shaped), so the composition is testable without a database.
import { isEvaluatorInfrastructureFailure } from './cosUniversityMassEvaluationRollingAuthority.ts'
import { errorText } from './cosUniversityErrorText.ts'
import { readUniversityMassDistillationHealth, type UniversityDistillationHealthSnapshot } from '../../../self-healing-host/university-distillation-monitoring.ts'

export const FUNNEL_SCHEMA_VERSION = 'cos-university-effectiveness-funnel-v1' as const
/** How many artifacts one funnel follows. Beyond this the report says it is truncated instead of guessing. */
export const FUNNEL_COHORT_LIMIT = 1500
/** Ids per `in()` read. Candidate ids are short; this stays well inside a URL. */
export const FUNNEL_READ_CHUNK = 100
/** Page size for high-volume evidence reads. Every buyer-evidence chapter pages until exhausted. */
export const FUNNEL_ROWS_PER_CHUNK = 1000

/** The terminal claim the evaluation route writes on a failed exam (cos-university-mass-distilled-evaluation FAILED). */
export const EVALUATION_FAILED_CLAIM = 'mass_distilled_independent_evaluation_failed' as const

export type FunnelWindow = '24h' | '7d' | '30d' | 'all'
export const FUNNEL_WINDOWS: readonly FunnelWindow[] = Object.freeze(['24h', '7d', '30d', 'all'])
const WINDOW_HOURS: Readonly<Record<FunnelWindow, number | null>> = Object.freeze({ '24h': 24, '7d': 168, '30d': 720, all: null })

type Db = { from: (table: string) => any }

const text = (value: unknown, max = 200): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
/** The resident's own loop stop, from case-run metadata.builderLoop (platform-harness/residency/builder-case-runner.ts). */
const builderLoopStop = (metadata: unknown): { loopStop: string; filesChanged: number | null; loopShape: string | null } => {
  const loop = metadata && typeof metadata === 'object' ? (metadata as { builderLoop?: Record<string, unknown> }).builderLoop : undefined
  if (!loop || typeof loop !== 'object') return { loopStop: 'unrecorded', filesChanged: null, loopShape: null }
  const files = Number(loop.filesChanged)
  return {
    loopStop: text(loop.failureCode, 80) || (text(loop.outcome, 20) === 'completed' ? 'loop_completed' : 'unrecorded'),
    filesChanged: loop.filesChanged === null || loop.filesChanged === undefined || !Number.isFinite(files) ? null : files,
    // Content-free tool shape (builder-case-runner builderLoopShape), recorded since 2026-10-07.
    loopShape: text(loop.shape, 400) || null,
  }
}
const iso = (value: unknown): string | null => {
  if (!value) return null
  const at = new Date(String(value))
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

async function rows(query: any): Promise<any[]> {
  const result = await query
  if (result?.error) throw result.error
  return Array.isArray(result?.data) ? result.data : []
}

/** Exhaustive PostgREST read. A buyer metric is never silently capped at the first page. */
async function allRows(build: (from: number, to: number) => any, pageSize = FUNNEL_ROWS_PER_CHUNK): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += pageSize) {
    const page = await rows(build(from, from + pageSize - 1))
    out.push(...page)
    if (page.length < pageSize) return out
  }
}

const chunks = <T,>(list: readonly T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export type FunnelStage = Readonly<{
  id: string
  /** Artifacts of the cohort that reached this stage. */
  count: number
  /** count / cohort, 0..1; null when the cohort is empty. */
  share: number | null
  source: string
}>

type Chapter<T> = Readonly<{ available: true; error: null } & T> | Readonly<{ available: false; error: string }>

export type EffectivenessFunnel = Readonly<{
  schemaVersion: typeof FUNNEL_SCHEMA_VERSION
  generatedAt: string
  window: FunnelWindow
  since: string | null
  subjectId: string | null
  cohort: Readonly<{ size: number; truncated: boolean; source: string }>
  /**
   * The cohort's line activity by UTC day (birth, latest exam, graduate promotion), so one snapshot can show whether the
   * whole line ran on more than one day. Days are event days of cohort members; nothing outside the cohort is counted.
   */
  /**
   * Manual actions recorded in the window (cos_university_operator_actions): direct database writes to factory tables by
   * any session other than the platform's, and owner admin-route actions. measuredSince is when the ledger was installed.
   */
  manualIntervention: Chapter<{ measuredSince: string | null; databaseSessionWrites: number; adminRouteActions: number; byTarget: Readonly<Record<string, number>>; source: string }>
  /**
   * What the cohort's latest exams were graded with: evaluator version and the safety:transfer:retention suite fingerprint
   * (the fixed exam sets; holdouts are per artifact). One of each in a window means the same exam standard throughout.
   */
  examStandards: Chapter<{ examined: number; evaluatorVersions: Readonly<Record<string, number>>; fixedSuites: Readonly<Record<string, number>>; source: string }>
  dailyActivity: Readonly<{ days: readonly Readonly<{ day: string; born: number; examined: number; graduated: number }>[]; source: string; methodology: string }>
  /** Before birth: distillation runs started in the window and how they ended. */
  production: Chapter<{ runsStarted: number; runsCompleted: number; runsFailed: number; runsInFlight: number; source: string }>
  stages: readonly FunnelStage[]
  /** Which chapters could not be read. A missing chapter zeroes its stages; the names here say which, so nothing passes as a real zero. */
  unavailable: Readonly<Record<string, string>>
  rejected: Readonly<{ quarantined: number; retired: number; byStatus: Readonly<Record<string, number>>; source: string }>
  capabilityGain: Chapter<{
    sampleSize: number
    improved: number
    unchanged: number
    regressed: number
    meanBaseline: number | null
    meanTrained: number | null
    meanAbsoluteGain: number | null
    medianAbsoluteGain: number | null
    positiveGainRate: number | null
    source: string
    methodology: string
  }>
  reliability: Chapter<{
    attempts: number
    successes: number
    failures: number
    fallbacks: number
    successRate: number | null
    p50LatencyMs: number | null
    p90LatencyMs: number | null
    p99LatencyMs: number | null
    over15s: number
    byOutcome: Readonly<Record<string, number>>
    byErrorClass: Readonly<Record<string, number>>
    source: string
    methodology: string
  }>
  lineHealth: Chapter<{
    liveUnits: number
    overdueUnits: number
    leasedUnits: number
    oldestWaitingSeconds: number | null
    byStation: Readonly<Record<string, Readonly<{ waiting: number; overdue: number; leased: number; oldestWaitingSeconds: number | null }>>>
    bottleneckStation: string | null
    source: string
    methodology: string
  }>
  lineHistory: Chapter<{
    transitions: number
    throughputPerHour: number | null
    recoveredOverdue: number
    meanRecoverySeconds: number | null
    medianRecoverySeconds: number | null
    p90RecoverySeconds: number | null
    p50DwellSeconds: number | null
    p90DwellSeconds: number | null
    p99DwellSeconds: number | null
    byFromStation: Readonly<Record<string, number>>
    source: string
    methodology: string
  }>
  residencyEffectiveness: Chapter<{
    enrollments: number
    completed: number
    remediationRequired: number
    caseRuns: number
    casesPassed: number
    casesFailed: number
    casesRejected: number
    competencyEvidence: number
    competencyPasses: number
    competencyFailures: number
    completionRate: number | null
    casePassRate: number | null
    /** Finished case runs by the Harness verdict (agent_failure = skill, infrastructure_failure = platform, ...). */
    caseOutcomes: Readonly<Record<string, number>>
    /** Most frequent failure codes on finished, non-passing case runs. */
    topFailureCodes: Readonly<Record<string, number>>
    /** Residents by standing. */
    standings: Readonly<Record<string, number>>
    /**
     * Why the resident's own Builder loop stopped on each FAILED case (case-run metadata.builderLoop, recorded since
     * 2026-10-05): a loop failure code such as builder_stalled_repeated_inspection or builder_model_control_malformed_json,
     * loop_completed when the loop finished but the independent proof still failed, or unrecorded for older rows.
     */
    failedCaseLoopStops: Readonly<Record<string, number>>
    /** Failed cases where the resident changed no seed file at all. */
    failedCasesWithNoFileChange: number
    /**
     * The most common content-free loop shapes of FAILED cases (recorded since 2026-10-07), so a resident repeating one
     * identical call can be told from a loop guard rejecting a new one. Rows without a shape are not counted here.
     */
    failedCaseLoopShapes: Readonly<Record<string, number>>
    /** Skill-failure competency evidence by competency. */
    competencyFailuresById: Readonly<Record<string, number>>
    source: string
    methodology: string
  }>
  workforceEffectiveness: Chapter<{
    assignments: number
    verified: number
    remediation: number
    runtimeFailed: number
    servedAwaitingVerification: number
    productionRequests: number
    productionShadows: number
    verifiedRate: number | null
    source: string
    methodology: string
  }>
  economics: Chapter<{
    settledProviderJobs: number
    observedProviderCostUsd: number
    byOperationUsd: Readonly<Record<string, number>>
    costPerGraduatedArtifactUsd: number | null
    costPerVerifiedOutcomeUsd: number | null
    coverage: string
    source: string
    methodology: string
  }>
  comparativeBenchmark: Chapter<{
    comparableArtifacts: number
    baselineMean: number | null
    universityMean: number | null
    absoluteGain: number | null
    relativeGain: number | null
    improved: number
    unchanged: number
    regressed: number
    residencyCompletedComparable: number
    residencyCompletedMean: number | null
    productionGraduatesComparable: number
    productionGraduatesMean: number | null
    source: string
    methodology: string
  }>
  governanceAssurance: Chapter<{
    authorityExpansionObserved: number
    assuranceEvents: number
    repositoryEvidenceEntries: number
    repositoryEvidenceChainValid: boolean | null
    killSwitchControl: 'implemented_not_live_attested'
    signedScopeControl: 'implemented_not_live_attested'
    thirdPartyPenetrationTest: 'not_evidenced'
    certificationClaim: 'not_claimed'
    source: string
    methodology: string
  }>
  provenance: Chapter<{
    birthCertificates: number
    graduates: number
    resumes: number
    workforceAssignmentsWithPermanentId: number
    traceableGraduates: number
    traceableGraduateRate: number | null
    source: string
    methodology: string
  }>
  operationalExplanation: Chapter<{
    state: UniversityDistillationHealthSnapshot['state']
    reasons: readonly string[]
    causeStatus: 'evidence_backed' | 'unresolved'
    classification: 'healthy_progress' | 'expected_wait' | 'repair_required' | 'budget_pause' | 'authorization_required' | 'curriculum_wait' | 'unresolved'
    cause: string
    impact: string
    systemResponse: string
    buyerMeaning: string
    activeCampaigns: number
    unsettledProviderJobs: number
    overdueProviderJobs: number
    automaticRecoveryAuthorized: boolean
    source: string
  }>
  evaluationFailures: Chapter<{
    total: number
    infrastructure: number
    merit: number
    byReason: Readonly<Record<string, number>>
    explanations: readonly Readonly<{
      reason: string
      count: number
      attribution: 'infrastructure' | 'competency'
      causeStatus: 'evidence_backed' | 'unresolved'
      cause: string
      impact: string
      systemResponse: string
      buyerMeaning: string
    }>[]
    source: string
    rule: string
  }>
  authorityExpanded: false
}>

const SOURCE = Object.freeze({
  artifacts: 'cos_local_distillation_artifacts',
  certificates: 'cos_university_artifact_birth_certificates',
  runs: 'cos_university_mass_distillation_batch_runs',
  evaluations: 'cos_university_distilled_evaluation_runs',
  residency: 'cos_university_residency_enrollments',
  registry: 'cos_university_graduate_model_registry',
  roster: 'cos_workforce_roster',
  attempts: 'cos_university_graduate_serving_attempts',
  lifecycle: 'cos_university_graduate_lifecycle_events',
  assurance: 'cos_university_learning_assurance_events',
  orchestration: 'cos_university_lifecycle_orchestration',
  transitionHistory: 'cos_university_lifecycle_transition_history',
})

/** Pure: compose the funnel from the cohort and the per-table facts. Exported so the arithmetic is testable alone. */
export function composeFunnel(input: {
  now: Date
  window: FunnelWindow
  since: string | null
  subjectId: string | null
  cohort: readonly Readonly<{ candidateId: string; hash: string; status: string; createdAt?: string | null }>[]
  truncated: boolean
  production: Chapter<{ runsStarted: number; runsCompleted: number; runsFailed: number }>
  certified: Chapter<{ candidates: ReadonlySet<string> }>
  examined: Chapter<{ latestByKey: ReadonlyMap<string, { improved: boolean; safety: boolean; transfer: boolean; retention: boolean; baseline: number | null; trained: number | null; at?: number; evaluatorVersion?: string; suites?: string }> }>
  residency: Chapter<{ enrolled: ReadonlySet<string>; complete: ReadonlySet<string> }>
  graduation: Chapter<{ promoted: ReadonlySet<string>; activated: ReadonlySet<string>; promotedAt?: ReadonlyMap<string, string> }>
  hired: Chapter<{ candidates: ReadonlySet<string> }>
  work: Chapter<{ attempted: ReadonlySet<string>; succeeded: ReadonlySet<string> }>
  verified: Chapter<{ candidates: ReadonlySet<string> }>
  serving: Chapter<{ terminalByAttempt: ReadonlyMap<string, { outcome: string; latencyMs: number; errorClass: string | null }> }>
  lineLedger: Chapter<{ rows: readonly Readonly<{ station: string; enteredAt: string | null; deadlineAt: string | null; leaseUntil: string | null; terminal: boolean }>[] }>
  transitionHistory: Chapter<{ rows: readonly Readonly<{ fromStation: string; transitionedAt: string | null; durationSeconds: number | null; wasOverdue: boolean }>[] }>
  residencyEvidence: Chapter<{ enrollments: readonly Readonly<{ key: string; standing: string }>[]; caseStatuses: readonly string[]; competencyOutcomes: readonly string[]; caseRuns?: readonly Readonly<{ status: string; harnessOutcome: string; failureCode: string; loopStop?: string; filesChanged?: number | null; loopShape?: string | null }>[]; competencyFailures?: readonly string[] }>
  workforceAssignments: Chapter<{ rows: readonly Readonly<{ status: string; sourceKind: string; permanentArtifactId: string }>[] }>
  providerCosts: Chapter<{ rows: readonly Readonly<{ operation: string; observedCostUsd: number }>[] }>
  provenanceEvidence: Chapter<{ certificates: ReadonlySet<string>; graduates: ReadonlySet<string>; resumes: ReadonlySet<string> }>
  governanceEvidence: Chapter<{ authorityExpansionObserved: number; assuranceEvents: number; repositoryEvidenceEntries: number; repositoryEvidenceChainValid: boolean | null }>
  evaluationFailures: Chapter<{ errors: readonly string[] }>
  operationalHealth?: Chapter<{ snapshot: UniversityDistillationHealthSnapshot }>
  /** Manual actions on the line (migration 20261007030000): direct database writes and owner admin-route actions. */
  operatorActions?: Chapter<{ installedAt: string | null; rows: readonly Readonly<{ source: string; target: string; operation: string; occurredAt: string | null }>[] }>
}): EffectivenessFunnel {
  const size = input.cohort.length
  const share = (count: number) => size ? Number((count / size).toFixed(4)) : null
  const unavailable: Record<string, string> = {}
  const count = <T,>(chapter: Chapter<T>, name: string, f: (c: T) => number): number => {
    if (chapter.available === false) { unavailable[name] = chapter.error; return 0 }
    return f(chapter as unknown as T)
  }
  const keyOf = (a: { candidateId: string; hash: string }) => `${a.candidateId}:${a.hash}`
  const inSet = (set: ReadonlySet<string>, by: 'candidate' | 'key') => input.cohort.filter(a => set.has(by === 'key' ? keyOf(a) : a.candidateId)).length
  const latest = (pick: (r: { improved: boolean; safety: boolean; transfer: boolean; retention: boolean; baseline: number | null; trained: number | null }) => boolean) =>
    (c: { latestByKey: ReadonlyMap<string, { improved: boolean; safety: boolean; transfer: boolean; retention: boolean; baseline: number | null; trained: number | null }> }) =>
      input.cohort.filter(a => { const r = c.latestByKey.get(keyOf(a)); return Boolean(r && pick(r)) }).length

  const stage = (id: string, n: number, source: string): FunnelStage => Object.freeze({ id, count: n, share: share(n), source })
  const stages: FunnelStage[] = [
    stage('born', size, SOURCE.artifacts),
    stage('birth_certificate', count(input.certified, 'certified', c => inSet(c.candidates, 'candidate')), SOURCE.certificates),
    stage('examined', count(input.examined, 'examined', c => input.cohort.filter(a => c.latestByKey.has(keyOf(a))).length), SOURCE.evaluations),
    stage('improved_over_baseline', count(input.examined, 'examined', latest(r => r.improved)), SOURCE.evaluations),
    stage('passed_safety', count(input.examined, 'examined', latest(r => r.safety)), SOURCE.evaluations),
    stage('passed_transfer', count(input.examined, 'examined', latest(r => r.transfer)), SOURCE.evaluations),
    stage('passed_retention', count(input.examined, 'examined', latest(r => r.retention)), SOURCE.evaluations),
    stage('passed_all_gates', count(input.examined, 'examined', latest(r => r.improved && r.safety && r.transfer && r.retention)), SOURCE.evaluations),
    stage('residency_enrolled', count(input.residency, 'residency', c => inSet(c.enrolled, 'key')), SOURCE.residency),
    stage('residency_complete', count(input.residency, 'residency', c => inSet(c.complete, 'key')), SOURCE.residency),
    stage('graduated', count(input.graduation, 'graduation', c => inSet(c.promoted, 'key')), SOURCE.registry),
    stage('activated', count(input.graduation, 'graduation', c => inSet(c.activated, 'key')), SOURCE.registry),
    stage('hired', count(input.hired, 'hired', c => inSet(c.candidates, 'key')), SOURCE.roster),
    stage('performed_work', count(input.work, 'work', c => inSet(c.attempted, 'key')), SOURCE.attempts),
    stage('served_successfully', count(input.work, 'work', c => inSet(c.succeeded, 'key')), SOURCE.attempts),
    stage('verified_outcome', count(input.verified, 'verified', c => inSet(c.candidates, 'key')), SOURCE.lifecycle),
  ]

  const byStatus: Record<string, number> = {}
  for (const a of input.cohort) byStatus[a.status || 'unknown'] = (byStatus[a.status || 'unknown'] || 0) + 1

  let capabilityGain: EffectivenessFunnel['capabilityGain']
  if (input.examined.available) {
    const examined = input.examined
    const points = input.cohort.flatMap(a => {
      const r = examined.latestByKey.get(keyOf(a))
      return r && r.baseline !== null && r.trained !== null ? [{ baseline: r.baseline, trained: r.trained, gain: r.trained - r.baseline }] : []
    })
    const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    const median = (values: readonly number[]) => {
      if (!values.length) return null
      const sorted = [...values].sort((a, b) => a - b)
      const middle = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    }
    const gains = points.map(p => p.gain)
    const improved = gains.filter(g => g > 0).length
    capabilityGain = Object.freeze({ available: true as const, error: null,
      sampleSize: points.length,
      improved,
      unchanged: gains.filter(g => g === 0).length,
      regressed: gains.filter(g => g < 0).length,
      meanBaseline: mean(points.map(p => p.baseline)),
      meanTrained: mean(points.map(p => p.trained)),
      meanAbsoluteGain: mean(gains),
      medianAbsoluteGain: median(gains),
      positiveGainRate: points.length ? improved / points.length : null,
      source: SOURCE.evaluations,
      methodology: 'latest independent evaluation per exact cohort artifact; trained_artifact_score - baseline_score on holdout',
    })
  } else capabilityGain = Object.freeze({ available: false as const, error: input.examined.error })

  const production: EffectivenessFunnel['production'] = input.production.available
    ? Object.freeze({ available: true as const, error: null, runsStarted: input.production.runsStarted, runsCompleted: input.production.runsCompleted, runsFailed: input.production.runsFailed, runsInFlight: Math.max(0, input.production.runsStarted - input.production.runsCompleted - input.production.runsFailed), source: SOURCE.runs })
    : Object.freeze({ available: false as const, error: input.production.error })

  let reliability: EffectivenessFunnel['reliability']
  if (input.serving.available) {
    const terminal = [...input.serving.terminalByAttempt.values()]
    const latencies = terminal.filter(row => row.outcome === 'success').map(row => row.latencyMs).sort((a, b) => a - b)
    const percentile = (p: number): number | null => {
      if (!latencies.length) return null
      const index = Math.min(latencies.length - 1, Math.ceil(p * latencies.length) - 1)
      return latencies[Math.max(0, index)]
    }
    const byOutcome: Record<string, number> = {}
    const byErrorClass: Record<string, number> = {}
    for (const row of terminal) {
      byOutcome[row.outcome] = (byOutcome[row.outcome] || 0) + 1
      if (row.errorClass) byErrorClass[row.errorClass] = (byErrorClass[row.errorClass] || 0) + 1
    }
    const successes = byOutcome.success || 0
    const fallbacks = byOutcome.fallback || 0
    const failures = terminal.length - successes - fallbacks
    reliability = Object.freeze({ available: true as const, error: null,
      attempts: terminal.length, successes, failures, fallbacks,
      successRate: terminal.length ? successes / terminal.length : null,
      p50LatencyMs: percentile(0.50), p90LatencyMs: percentile(0.90), p99LatencyMs: percentile(0.99),
      over15s: latencies.filter(ms => ms > 15_000).length,
      byOutcome: Object.freeze(byOutcome), byErrorClass: Object.freeze(byErrorClass),
      source: SOURCE.attempts,
      methodology: 'one latest terminal serving record per attempt_id in the selected window; latency percentiles use successful terminal attempts only',
    })
  } else reliability = Object.freeze({ available: false as const, error: input.serving.error })

  let lineHealth: EffectivenessFunnel['lineHealth']
  if (input.lineLedger.available) {
    const nowMs = input.now.getTime()
    const live = input.lineLedger.rows.filter(row => !row.terminal)
    const stationMap: Record<string, { waiting: number; overdue: number; leased: number; oldestWaitingSeconds: number | null }> = {}
    for (const row of live) {
      const station = row.station || 'UNKNOWN'
      const enteredMs = row.enteredAt ? Date.parse(row.enteredAt) : NaN
      const deadlineMs = row.deadlineAt ? Date.parse(row.deadlineAt) : NaN
      const leaseMs = row.leaseUntil ? Date.parse(row.leaseUntil) : NaN
      const age = Number.isFinite(enteredMs) ? Math.max(0, Math.floor((nowMs - enteredMs) / 1000)) : null
      const current = stationMap[station] || { waiting: 0, overdue: 0, leased: 0, oldestWaitingSeconds: null }
      current.waiting += 1
      if (Number.isFinite(deadlineMs) && deadlineMs <= nowMs) current.overdue += 1
      if (Number.isFinite(leaseMs) && leaseMs > nowMs) current.leased += 1
      if (age !== null && (current.oldestWaitingSeconds === null || age > current.oldestWaitingSeconds)) current.oldestWaitingSeconds = age
      stationMap[station] = current
    }
    const stations = Object.entries(stationMap)
    stations.sort((a, b) => b[1].waiting - a[1].waiting || b[1].overdue - a[1].overdue)
    const oldest = live.map(row => row.enteredAt ? Date.parse(row.enteredAt) : NaN).filter(Number.isFinite).sort((a, b) => a - b)[0]
    lineHealth = Object.freeze({ available: true as const, error: null, liveUnits: live.length,
      overdueUnits: Object.values(stationMap).reduce((n, row) => n + row.overdue, 0),
      leasedUnits: Object.values(stationMap).reduce((n, row) => n + row.leased, 0),
      oldestWaitingSeconds: Number.isFinite(oldest) ? Math.max(0, Math.floor((nowMs - oldest) / 1000)) : null,
      byStation: Object.freeze(Object.fromEntries(Object.entries(stationMap).map(([k, v]) => [k, Object.freeze(v)]))),
      bottleneckStation: stations[0]?.[0] || null,
      source: SOURCE.orchestration,
      methodology: 'current nonterminal lifecycle ledger rows; overdue means stage_deadline_at <= report time; leased means lease_until > report time; bottleneck is the station with the largest live queue, then overdue count',
    })
  } else lineHealth = Object.freeze({ available: false as const, error: input.lineLedger.error })

  let lineHistory: EffectivenessFunnel['lineHistory']
  if (input.transitionHistory.available) {
    const transitions = input.transitionHistory.rows.filter(row => row.transitionedAt)
    const dwell = transitions.filter(row => row.durationSeconds !== null).map(row => row.durationSeconds as number).sort((a, b) => a - b)
    const recovery = transitions.filter(row => row.wasOverdue && row.durationSeconds !== null).map(row => row.durationSeconds as number).sort((a, b) => a - b)
    const percentile = (values: readonly number[], p: number): number | null => values.length ? values[Math.max(0, Math.min(values.length - 1, Math.ceil(values.length * p) - 1))] : null
    const byFromStation: Record<string, number> = {}
    for (const row of transitions) if (row.fromStation) byFromStation[row.fromStation] = (byFromStation[row.fromStation] || 0) + 1
    const windowSeconds = input.since ? Math.max(1, (input.now.getTime() - Date.parse(input.since)) / 1000) : null
    lineHistory = Object.freeze({ available: true as const, error: null, transitions: transitions.length,
      throughputPerHour: windowSeconds ? transitions.length / (windowSeconds / 3600) : null,
      recoveredOverdue: recovery.length,
      meanRecoverySeconds: recovery.length ? recovery.reduce((a, b) => a + b, 0) / recovery.length : null,
      medianRecoverySeconds: percentile(recovery, 0.5), p90RecoverySeconds: percentile(recovery, 0.9),
      p50DwellSeconds: percentile(dwell, 0.5), p90DwellSeconds: percentile(dwell, 0.9), p99DwellSeconds: percentile(dwell, 0.99),
      byFromStation: Object.freeze(byFromStation), source: SOURCE.transitionHistory,
      methodology: 'exhaustively paged append-only station transitions in the selected event window; throughput is observed transitions per elapsed window hour; dwell percentiles use all prior-station residence durations; recovery duration uses transitions whose prior deadline had expired',
    })
  } else lineHistory = Object.freeze({ available: false as const, error: input.transitionHistory.error })

  let residencyEffectiveness: EffectivenessFunnel['residencyEffectiveness']
  if (input.residencyEvidence.available) {
    const e = input.residencyEvidence
    const completed = e.enrollments.filter(row => row.standing === 'residency_complete').length
    const remediationRequired = e.enrollments.filter(row => row.standing === 'remediation_required').length
    const casesPassed = e.caseStatuses.filter(x => x === 'passed').length
    const casesFailed = e.caseStatuses.filter(x => x === 'failed').length
    const casesRejected = e.caseStatuses.filter(x => x === 'rejected').length
    const competencyPasses = e.competencyOutcomes.filter(x => x === 'pass').length
    const competencyFailures = e.competencyOutcomes.filter(x => x === 'fail').length
    const terminalCases = casesPassed + casesFailed + casesRejected
    const tally = (values: readonly string[]) => {
      const out: Record<string, number> = {}
      for (const value of values) out[value] = (out[value] || 0) + 1
      return out
    }
    const topOf = (map: Record<string, number>, n: number) => Object.freeze(Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n)))
    const finished = (e.caseRuns || []).filter(row => row.status !== 'started')
    const caseOutcomes = topOf(tally(finished.map(row => row.harnessOutcome || 'unrecorded')), 8)
    const topFailureCodes = topOf(tally(finished.filter(row => row.status !== 'passed').map(row => row.failureCode || 'unrecorded')), 6)
    const standings = topOf(tally(e.enrollments.map(row => row.standing || 'unrecorded')), 8)
    const failedCases = finished.filter(row => row.status === 'failed')
    const failedCaseLoopStops = topOf(tally(failedCases.map(row => row.loopStop || 'unrecorded')), 8)
    const failedCasesWithNoFileChange = failedCases.filter(row => row.filesChanged === 0).length
    const failedCaseLoopShapes = topOf(tally(failedCases.filter(row => row.loopShape).map(row => row.loopShape as string)), 5)
    const competencyFailuresById = topOf(tally(e.competencyFailures || []), 13)
    residencyEffectiveness = Object.freeze({ available: true as const, error: null, enrollments: e.enrollments.length, completed, remediationRequired, caseRuns: e.caseStatuses.length, casesPassed, casesFailed, casesRejected, competencyEvidence: e.competencyOutcomes.length, competencyPasses, competencyFailures, completionRate: e.enrollments.length ? completed / e.enrollments.length : null, casePassRate: terminalCases ? casesPassed / terminalCases : null, caseOutcomes, topFailureCodes, standings, failedCaseLoopStops, failedCasesWithNoFileChange, failedCaseLoopShapes, competencyFailuresById, source: 'cos_university_residency_enrollments + cos_university_residency_case_runs + cos_university_residency_competency_evidence', methodology: 'exact cohort artifacts; completion comes only from durable residency standing; case and competency outcomes are counted from durable practical evidence' })
  } else residencyEffectiveness = Object.freeze({ available: false as const, error: input.residencyEvidence.error })

  let workforceEffectiveness: EffectivenessFunnel['workforceEffectiveness']
  if (input.workforceAssignments.available) {
    const rows = input.workforceAssignments.rows
    const n = (status: string) => rows.filter(row => row.status === status).length
    const verified = n('verified'), remediation = n('remediation'), runtimeFailed = n('runtime_failed'), servedAwaitingVerification = n('served')
    const decided = verified + remediation
    workforceEffectiveness = Object.freeze({ available: true as const, error: null, assignments: rows.length, verified, remediation, runtimeFailed, servedAwaitingVerification, productionRequests: rows.filter(row => row.sourceKind === 'production_request').length, productionShadows: rows.filter(row => row.sourceKind === 'production_shadow').length, verifiedRate: decided ? verified / decided : null, source: 'cos_workforce_assignments', methodology: 'exact cohort assignments; verified/remediation are governed Production outcomes, runtime_failed remains infrastructure and is excluded from competence verification rate' })
  } else workforceEffectiveness = Object.freeze({ available: false as const, error: input.workforceAssignments.error })

  let economics: EffectivenessFunnel['economics']
  if (input.providerCosts.available) {
    const rows = input.providerCosts.rows
    const byOperationUsd: Record<string, number> = {}
    for (const row of rows) byOperationUsd[row.operation] = (byOperationUsd[row.operation] || 0) + row.observedCostUsd
    const total = rows.reduce((sum, row) => sum + row.observedCostUsd, 0)
    const graduated = stages.find(s => s.id === 'graduated')?.count || 0
    const verifiedOutcomes = stages.find(s => s.id === 'verified_outcome')?.count || 0
    economics = Object.freeze({ available: true as const, error: null, settledProviderJobs: rows.length, observedProviderCostUsd: total, byOperationUsd: Object.freeze(byOperationUsd), costPerGraduatedArtifactUsd: graduated ? total / graduated : null, costPerVerifiedOutcomeUsd: verifiedOutcomes ? total / verifiedOutcomes : null, coverage: 'observed mass-distillation provider jobs for cohort candidate IDs; provider ledger has no artifact hash, so this is not exact-artifact cost attribution or total platform TCO', source: 'cos_university_mass_distillation_provider_jobs', methodology: 'sum observed_cost_usd for settled provider jobs whose candidate_id is in the cohort; cost attribution is candidate-level because the provider ledger does not store trained_artifact_hash; denominators are cohort graduates and verified outcomes' })
  } else economics = Object.freeze({ available: false as const, error: input.providerCosts.error })

  let comparativeBenchmark: EffectivenessFunnel['comparativeBenchmark']
  if (input.examined.available && input.residency.available && input.graduation.available) {
    const examined = input.examined
    const residency = input.residency
    const graduation = input.graduation
    const points = input.cohort.flatMap(a => {
      const r = examined.latestByKey.get(keyOf(a))
      return r && r.baseline !== null && r.trained !== null ? [{ key: keyOf(a), baseline: r.baseline, trained: r.trained, gain: r.trained - r.baseline }] : []
    })
    const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    const baselineMean = mean(points.map(p => p.baseline))
    const universityMean = mean(points.map(p => p.trained))
    const residencyPoints = points.filter(p => residency.complete.has(p.key))
    const graduatePoints = points.filter(p => graduation.activated.has(p.key))
    const absoluteGain = baselineMean === null || universityMean === null ? null : universityMean - baselineMean
    comparativeBenchmark = Object.freeze({ available: true as const, error: null,
      comparableArtifacts: points.length, baselineMean, universityMean, absoluteGain,
      relativeGain: absoluteGain === null || baselineMean === null || baselineMean === 0 ? null : absoluteGain / baselineMean,
      improved: points.filter(p => p.gain > 0).length, unchanged: points.filter(p => p.gain === 0).length, regressed: points.filter(p => p.gain < 0).length,
      residencyCompletedComparable: residencyPoints.length, residencyCompletedMean: mean(residencyPoints.map(p => p.trained)),
      productionGraduatesComparable: graduatePoints.length, productionGraduatesMean: mean(graduatePoints.map(p => p.trained)),
      source: 'cos_university_distilled_evaluation_runs + cos_university_residency_enrollments + cos_university_graduate_model_registry',
      methodology: 'same exact-artifact independent holdout scores; baseline and trained are paired per artifact; Residency/production rows are labeled subsets, not causal post-Residency re-tests',
    })
  } else comparativeBenchmark = Object.freeze({ available: false as const, error: input.examined.available === false ? input.examined.error : input.residency.available === false ? input.residency.error : input.graduation.available === false ? input.graduation.error : 'comparative_benchmark_unavailable' })

  let governanceAssurance: EffectivenessFunnel['governanceAssurance']
  if (input.governanceEvidence.available) {
    governanceAssurance = Object.freeze({ available: true as const, error: null,
      authorityExpansionObserved: input.governanceEvidence.authorityExpansionObserved,
      assuranceEvents: input.governanceEvidence.assuranceEvents,
      repositoryEvidenceEntries: input.governanceEvidence.repositoryEvidenceEntries,
      repositoryEvidenceChainValid: input.governanceEvidence.repositoryEvidenceChainValid,
      killSwitchControl: 'implemented_not_live_attested' as const,
      signedScopeControl: 'implemented_not_live_attested' as const,
      thirdPartyPenetrationTest: 'not_evidenced' as const,
      certificationClaim: 'not_claimed' as const,
      source: 'cos_university_learning_assurance_events + security_repository_patrol_evidence + security-host/referee.ts',
      methodology: 'runtime evidence is counted from durable tables; code-enforced Referee/kill-switch controls are disclosed as implemented but not converted into live attestations; no third-party penetration-test or certification claim without authoritative evidence',
    })
  } else governanceAssurance = Object.freeze({ available: false as const, error: input.governanceEvidence.error })

  let provenance: EffectivenessFunnel['provenance']
  if (input.provenanceEvidence.available && input.workforceAssignments.available) {
    const p = input.provenanceEvidence
    const graduates = input.cohort.filter(a => p.graduates.has(keyOf(a)))
    const traceableGraduates = graduates.filter(a => p.certificates.has(keyOf(a)) && p.resumes.has(keyOf(a))).length
    provenance = Object.freeze({ available: true as const, error: null, birthCertificates: input.cohort.filter(a => p.certificates.has(keyOf(a))).length, graduates: graduates.length, resumes: input.cohort.filter(a => p.resumes.has(keyOf(a))).length, workforceAssignmentsWithPermanentId: input.workforceAssignments.rows.filter(row => Boolean(row.permanentArtifactId)).length, traceableGraduates, traceableGraduateRate: graduates.length ? traceableGraduates / graduates.length : null, source: 'cos_university_artifact_birth_certificates + cos_university_graduate_model_registry + cos_university_graduate_resumes + cos_workforce_assignments', methodology: 'exact candidate+artifact hash across birth certificate, graduate registry and evidence-derived résumé; Workforce assignments must carry permanent_artifact_id' })
  } else provenance = Object.freeze({ available: false as const, error: input.provenanceEvidence.available === false ? input.provenanceEvidence.error : input.workforceAssignments.available === false ? input.workforceAssignments.error : 'provenance_unavailable' })

  // classifiedInfrastructure: every full error string in this family matched the canonical classifier. The family key is
  // an 80-character prefix, so a long provider message ("RunPod PATCH ... HTTP 400: Max workers across all endpoin") can
  // lose the very words the classifier matches; the explanation must follow the same full-string rule as the counts.
  const explainEvaluationFailure = (reason: string, count: number, classifiedInfrastructure = false): EffectivenessFunnel['evaluationFailures'] extends Chapter<infer T> ? T extends { explanations: readonly (infer E)[] } ? E : never : never => {
    const infrastructure = classifiedInfrastructure || isEvaluatorInfrastructureFailure(reason)
    const lower = reason.toLowerCase()
    const evidence = (cause: string, impact: string, systemResponse: string, buyerMeaning: string) => Object.freeze({ reason, count, attribution: 'infrastructure' as const, causeStatus: 'evidence_backed' as const, cause, impact, systemResponse, buyerMeaning })
    if (lower.startsWith('mass_distilled_evaluation_judge_calibration_failed:')) return evidence(
      'The independent judge failed its own hidden known-good/known-bad calibration control before a trustworthy student grade could be accepted.',
      'No valid competency conclusion is attributed to the artifact from this attempt.',
      'The evaluation fails closed and remains retryable as evaluator infrastructure; it does not consume the artifact as a merit failure.',
      'The control detected an unreliable evaluator instead of allowing an unreliable score to influence graduation.'
    ) as any
    if (lower.includes('judge_case_invalid') || lower.includes('judge_json_invalid') || lower.includes('judge_case_count_invalid') || lower.includes('judge_identity_invalid')) return evidence(
      'The evaluator rejected its own judge protocol/output as malformed or internally inconsistent before a valid verdict existed.',
      'The attempt cannot support a student-quality conclusion.',
      'The evaluator fails closed and classifies the event as infrastructure so the student is protected from an invalid merit charge.',
      'Protocol validation prevented malformed scoring evidence from becoming a graduation decision.'
    ) as any
    if (lower.includes('runtime_not_ready') || lower.includes('gateway_ping_timeout') || lower.includes('runpod_timeout') || lower.includes('runtime_endpoint_id_missing')) return evidence(
      'The exact-artifact runtime was unavailable or not proven ready within the bounded evaluation window.',
      'The artifact was not fairly examinable during this attempt.',
      'The attempt fails closed as infrastructure and may be retried without treating runtime availability as student competency.',
      'Runtime readiness is separated from model quality, preserving the integrity of the evaluation.'
    ) as any
    if (lower.includes('candidate_answer_empty') || lower.includes('candidate_answer_missing')) return Object.freeze({
      reason, count, attribution: 'competency' as const, causeStatus: 'evidence_backed' as const,
      cause: 'The trained artifact reproduced a missing or empty answer under the evaluator\'s bounded candidate-only retry, so the behavior is attributable to the artifact rather than a missing judge result.',
      impact: 'The affected exam case cannot be credited as a successful trained-artifact response.',
      systemResponse: 'The event remains a substantive artifact outcome and is handled by the normal bounded merit/disposition policy.',
      buyerMeaning: 'The report distinguishes reproducible artifact behavior from evaluator or runtime faults instead of masking it as infrastructure.'
    }) as any
    // Recorded only when the trained artifact opened its answer and ran to the 1,024-token output cap
    // (finish=length, open=1, close=0) on the batch call AND on the bounded candidate-only solo retry
    // (cosUniversityMassDistilledArtifactEvaluation candidateSoloOutputExhaustion). The baseline never produces it.
    if (lower.includes('candidate_output_exhausted')) return Object.freeze({
      reason, count, attribution: 'competency' as const, causeStatus: 'evidence_backed' as const,
      cause: 'The trained artifact began its answer but never finished it within the output limit, and reproduced that on the evaluator\'s bounded candidate-only retry.',
      impact: 'The affected exam case cannot be credited as a completed trained-artifact response.',
      systemResponse: 'The event remains a substantive artifact outcome and is handled by the normal bounded merit/disposition policy.',
      buyerMeaning: 'A model that cannot finish an answer within the limit is reported as its own result, not as an evaluator fault.'
    }) as any
    if (infrastructure) return evidence(
      'The recorded reason matches the University\'s canonical evaluator-infrastructure classifier; the available evidence establishes that the evaluation mechanism, runtime, provider, budget, or protocol prevented a trustworthy competency result.',
      'The event is excluded from student merit attribution.',
      'The line fails closed and follows its governed infrastructure retry/recovery path.',
      'The same classifier used by production disposition is used by this buyer report, preventing reporting logic from reinterpreting the failure.'
    ) as any
    return Object.freeze({
      reason, count, attribution: 'competency' as const, causeStatus: 'unresolved' as const,
      cause: 'The recorded evidence does not establish a more specific causal explanation beyond the fact that this reason is not classified as evaluator infrastructure.',
      impact: 'The event remains in the artifact merit/disposition accounting unless later authoritative evidence changes its classification.',
      systemResponse: 'The normal bounded evaluation/disposition policy applies; the report does not invent a root cause.',
      buyerMeaning: 'Unknown causality is disclosed as unresolved rather than presented as a fabricated explanation.'
    }) as any
  }

  let operationalExplanation: EffectivenessFunnel['operationalExplanation']
  if (!input.operationalHealth) operationalExplanation = Object.freeze({ available: false as const, error: 'operational_health_not_supplied' })
  else if (input.operationalHealth.available === false) operationalExplanation = Object.freeze({ available: false as const, error: input.operationalHealth.error })
  else {
    const h = input.operationalHealth.snapshot
    const reasons = [...h.reasons]
    const fullHealthyCapacity = h.state === 'healthy' && h.activeCampaigns > 0 && h.unsettledProviderJobs >= h.activeCampaigns && h.overdueProviderJobs === 0
    const classification = h.state === 'repair_required' ? 'repair_required'
      : h.state === 'budget_paused' ? 'budget_pause'
      : h.state === 'authorization_required' ? 'authorization_required'
      : h.state === 'waiting_for_curriculum' ? 'curriculum_wait'
      : fullHealthyCapacity ? 'expected_wait'
      : h.state === 'healthy' ? 'healthy_progress' : 'unresolved'
    const narrative = classification === 'expected_wait' ? {
      causeStatus: 'evidence_backed' as const,
      cause: 'Training work is active and the observed provider jobs are still within their allowed runtime; available campaign capacity is therefore legitimately occupied.',
      impact: 'A new campaign may wait for an existing training slot to settle; this is bounded queueing, not evidence that the production line is stalled.',
      systemResponse: 'The control loop continues heartbeat, reconciliation and overdue-job checks and automatically admits more work when governed capacity becomes available.',
      buyerMeaning: 'The platform distinguishes healthy capacity saturation from an outage and does not exceed configured concurrency merely to make the dashboard move.'
    } : classification === 'repair_required' ? {
      causeStatus: 'evidence_backed' as const,
      cause: reasons.length ? `The canonical Self-Healing health model detected: ${reasons.join(', ')}.` : 'The canonical Self-Healing health model requires repair, but no more specific reason was recorded.',
      impact: 'Expected production progress is impaired until the affected condition is recovered.',
      systemResponse: h.automaticRecoveryAuthorized ? 'Bounded automatic recovery is authorized by the same health model; promotion and authority expansion remain disabled.' : 'The condition is fail-closed and is not represented as healthy progress.',
      buyerMeaning: 'An abnormal wait is reported as a repair condition rather than being hidden behind a green heartbeat.'
    } : classification === 'budget_pause' ? {
      causeStatus: 'evidence_backed' as const,
      cause: 'The rolling authorized training budget cannot currently fund another governed campaign.',
      impact: 'New paid training dispatch pauses while already-authorized work may continue.',
      systemResponse: 'The scheduler waits for the next governed budget release instead of exceeding the buyer-controlled spend boundary.',
      buyerMeaning: 'A financial control pause is distinguished from a software failure.'
    } : classification === 'authorization_required' ? {
      causeStatus: 'evidence_backed' as const,
      cause: 'Rolling campaign authorization is disabled.', impact: 'New training campaigns cannot be authorized.',
      systemResponse: 'The line remains fail-closed and does not create paid training authority.', buyerMeaning: 'Governance boundaries take precedence over apparent throughput.'
    } : classification === 'curriculum_wait' ? {
      causeStatus: 'evidence_backed' as const,
      cause: 'No prepared curriculum batch is currently available for a new campaign.', impact: 'Training waits upstream for rights-cleared curriculum packaging.',
      systemResponse: 'The curriculum acquisition/packaging path continues independently; the scheduler does not manufacture an invalid batch.', buyerMeaning: 'The report identifies supply waiting separately from compute, evaluator, and student failures.'
    } : classification === 'healthy_progress' ? {
      causeStatus: 'evidence_backed' as const,
      cause: 'The canonical Self-Healing health model reports no active fault.', impact: 'No material operational blockage is established by the current evidence.',
      systemResponse: 'Normal governed production processing continues.', buyerMeaning: 'Healthy status is tied to the same operational model used for repair decisions.'
    } : {
      causeStatus: 'unresolved' as const,
      cause: 'The available evidence does not establish a supported operational cause.', impact: 'The report cannot reliably explain the observed state.',
      systemResponse: 'No causal explanation is invented; the state remains unresolved until authoritative evidence exists.', buyerMeaning: 'Unknown causality is disclosed instead of being converted into a reassuring but unsupported story.'
    }
    operationalExplanation = Object.freeze({ available: true as const, error: null, state: h.state, reasons: Object.freeze(reasons), classification, ...narrative, activeCampaigns: h.activeCampaigns, unsettledProviderJobs: h.unsettledProviderJobs, overdueProviderJobs: h.overdueProviderJobs, automaticRecoveryAuthorized: h.automaticRecoveryAuthorized, source: 'self-healing-host/university-distillation-monitoring.readUniversityMassDistillationHealth' })
  }

  let evaluationFailures: EffectivenessFunnel['evaluationFailures']
  if (input.evaluationFailures.available) {
    const byReason: Record<string, number> = {}
    const infrastructureByReason: Record<string, number> = {}
    let infrastructure = 0
    for (const error of input.evaluationFailures.errors) {
      const family = text(error, 80).split(':').slice(0, 2).join(':')
      byReason[family] = (byReason[family] || 0) + 1
      if (isEvaluatorInfrastructureFailure(error)) {
        infrastructure += 1
        infrastructureByReason[family] = (infrastructureByReason[family] || 0) + 1
      }
    }
    evaluationFailures = Object.freeze({
      available: true as const, error: null,
      total: input.evaluationFailures.errors.length,
      infrastructure,
      merit: input.evaluationFailures.errors.length - infrastructure,
      byReason: Object.freeze(byReason),
      explanations: Object.freeze(Object.entries(byReason).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([reason, count]) => explainEvaluationFailure(reason, count, infrastructureByReason[reason] === count))),
      source: SOURCE.assurance,
      rule: 'cosUniversityMassEvaluationRollingAuthority.isEvaluatorInfrastructureFailure',
    })
  } else {
    evaluationFailures = Object.freeze({ available: false as const, error: input.evaluationFailures.error })
  }

  const dayOf = (value: unknown): string | null => {
    const ms = typeof value === 'number' ? value : Date.parse(String(value ?? ''))
    return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : null
  }
  const activity = new Map<string, { born: number; examined: number; graduated: number }>()
  const bump = (day: string | null, field: 'born' | 'examined' | 'graduated') => {
    if (!day) return
    const entry = activity.get(day) || { born: 0, examined: 0, graduated: 0 }
    entry[field] += 1
    activity.set(day, entry)
  }
  for (const a of input.cohort) {
    bump(dayOf(a.createdAt), 'born')
    if (input.examined.available) bump(dayOf(input.examined.latestByKey.get(keyOf(a))?.at), 'examined')
    if (input.graduation.available && input.graduation.promoted.has(keyOf(a))) bump(dayOf(input.graduation.promotedAt?.get(keyOf(a))), 'graduated')
  }
  let manualIntervention: EffectivenessFunnel['manualIntervention']
  if (!input.operatorActions) manualIntervention = Object.freeze({ available: false as const, error: 'operator_actions_not_supplied' })
  else if (!input.operatorActions.available) manualIntervention = Object.freeze({ available: false as const, error: input.operatorActions.error })
  else {
    const byTarget: Record<string, number> = {}
    let databaseSessionWrites = 0
    let adminRouteActions = 0
    for (const row of input.operatorActions.rows) {
      if (row.source === 'database_session') databaseSessionWrites += 1
      else if (row.source === 'admin_route') adminRouteActions += 1
      else continue
      const k = `${row.source}:${row.target}`
      byTarget[k] = (byTarget[k] || 0) + 1
    }
    manualIntervention = Object.freeze({ available: true as const, error: null, measuredSince: input.operatorActions.installedAt, databaseSessionWrites, adminRouteActions, byTarget: Object.freeze(byTarget), source: 'cos_university_operator_actions' })
  }

  let examStandards: EffectivenessFunnel['examStandards']
  if (input.examined.available) {
    const evaluatorVersions: Record<string, number> = {}
    const fixedSuites: Record<string, number> = {}
    let examinedCount = 0
    for (const a of input.cohort) {
      const exam = input.examined.latestByKey.get(keyOf(a))
      if (!exam) continue
      examinedCount += 1
      const version = exam.evaluatorVersion || 'unrecorded'
      const suites = exam.suites && !/^:*$/.test(exam.suites) ? exam.suites.split(':').map(h => h.slice(0, 12)).join(':') : 'unrecorded'
      evaluatorVersions[version] = (evaluatorVersions[version] || 0) + 1
      fixedSuites[suites] = (fixedSuites[suites] || 0) + 1
    }
    examStandards = Object.freeze({ available: true as const, error: null, examined: examinedCount, evaluatorVersions: Object.freeze(evaluatorVersions), fixedSuites: Object.freeze(fixedSuites), source: `${SOURCE.evaluations} evaluator_version + safety/transfer/retention suite hashes (latest exam per cohort artifact)` })
  } else examStandards = Object.freeze({ available: false as const, error: input.examined.error })

  const dailyActivity = Object.freeze({
    days: Object.freeze([...activity.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => Object.freeze({ day, ...v }))),
    source: `${SOURCE.artifacts} created_at + ${SOURCE.evaluations} created_at (latest exam) + cos_university_graduate_model_registry promoted_at`,
    methodology: 'cohort members only; each artifact counts once per stage, on the UTC day of its birth, latest exam and graduate promotion',
  })

  return Object.freeze({
    schemaVersion: FUNNEL_SCHEMA_VERSION,
    generatedAt: input.now.toISOString(),
    window: input.window,
    since: input.since,
    subjectId: input.subjectId,
    cohort: Object.freeze({ size, truncated: input.truncated, source: SOURCE.artifacts }),
    manualIntervention,
    examStandards,
    dailyActivity,
    production,
    capabilityGain,
    reliability,
    lineHealth,
    lineHistory,
    residencyEffectiveness,
    workforceEffectiveness,
    economics,
    comparativeBenchmark,
    governanceAssurance,
    operationalExplanation,
    provenance,
    stages: Object.freeze(stages),
    unavailable: Object.freeze(unavailable),
    rejected: Object.freeze({ quarantined: byStatus.quarantined || 0, retired: byStatus.retired || 0, byStatus: Object.freeze(byStatus), source: SOURCE.artifacts }),
    evaluationFailures,
    authorityExpanded: false as const,
  })
}

async function chapter<T>(read: () => Promise<T>): Promise<Chapter<T>> {
  try { return Object.freeze({ available: true as const, error: null, ...(await read()) }) }
  catch (error) { return Object.freeze({ available: false as const, error: errorText(error, 300) }) }
}

/** Read the funnel for a window (and optionally one subject) from the injected store. */
export async function readEffectivenessFunnel(input: { db: Db; window?: unknown; subjectId?: unknown; now?: Date }): Promise<EffectivenessFunnel> {
  const now = input.now ?? new Date()
  const window: FunnelWindow = FUNNEL_WINDOWS.includes(input.window as FunnelWindow) ? input.window as FunnelWindow : '7d'
  const hours = WINDOW_HOURS[window]
  const since = hours === null ? null : new Date(now.getTime() - hours * 3600_000).toISOString()
  const subjectId = text(input.subjectId, 120) || null
  const db = input.db

  // Cohort: artifacts registered in the window.
  let cohortQuery = db.from('cos_local_distillation_artifacts').select('candidate_id,trained_artifact_hash,status,created_at')
  if (since) cohortQuery = cohortQuery.gte('created_at', since)
  if (subjectId) cohortQuery = cohortQuery.eq('subject_id', subjectId)
  const cohortRows = await rows(cohortQuery.order('created_at', { ascending: false }).limit(FUNNEL_COHORT_LIMIT + 1))
  const truncated = cohortRows.length > FUNNEL_COHORT_LIMIT
  const cohort = cohortRows.slice(0, FUNNEL_COHORT_LIMIT).map((row: any) => Object.freeze({
    candidateId: text(row.candidate_id, 240),
    hash: text(row.trained_artifact_hash, 64).toLowerCase(),
    status: text(row.status, 60),
    createdAt: iso(row.created_at),
  }))
  const candidateIds = Array.from(new Set(cohort.map(a => a.candidateId))).filter(Boolean)
  const key = (row: any) => `${text(row.candidate_id, 240)}:${text(row.trained_artifact_hash, 64).toLowerCase()}`
  const cohortKeys = new Set(cohort.map(a => `${a.candidateId}:${a.hash}`))

  /** Read one table for the whole cohort, chunked by candidate id and exhaustively paged within each chunk. */
  const forCohort = async (table: string, columns: string, _pageSize = FUNNEL_ROWS_PER_CHUNK, refine?: (q: any) => any): Promise<any[]> => {
    const out: any[] = []
    for (const chunk of chunks(candidateIds, FUNNEL_READ_CHUNK)) {
      out.push(...await allRows((from, to) => {
        let q = db.from(table).select(columns).in('candidate_id', chunk)
        if (refine) q = refine(q)
        return q.range(from, to)
      }))
    }
    return out
  }

  const exhaust = async (build: () => any): Promise<any[]> =>
    allRows((from, to) => build().range(from, to))

  const [production, certified, examined, residency, graduation, hired, work, verified, serving, lineLedger, transitionHistory, residencyEvidence, workforceAssignments, providerCosts, provenanceEvidence, governanceEvidence, operationalHealth, evaluationFailures] = await Promise.all([
    chapter(async () => {
      let q = db.from('cos_university_mass_distillation_batch_runs').select('stage')
      if (since) q = q.gte('created_at', since)
      if (subjectId) q = q.eq('subject_id', subjectId)
      const list = await exhaust(() => q)
      const stageOf = (row: any) => text(row.stage, 60)
      return {
        runsStarted: list.length,
        runsCompleted: list.filter(r => stageOf(r) === 'complete').length,
        runsFailed: list.filter(r => stageOf(r) === 'failed').length,
      }
    }),
    chapter(async () => ({ candidates: new Set((await forCohort('cos_university_artifact_birth_certificates', 'candidate_id')).map((r: any) => text(r.candidate_id, 240))) })),
    chapter(async () => {
      const list = await forCohort('cos_university_distilled_evaluation_runs', 'candidate_id,trained_artifact_hash,created_at,baseline_score,trained_artifact_score,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed,evaluator_version,safety_suite_hash,transfer_suite_hash,retention_suite_hash', FUNNEL_ROWS_PER_CHUNK)
      // Latest run per exact artifact decides the stage; an earlier failure that a later run cleared is not a failure.
      const latestByKey = new Map<string, { at: number; improved: boolean; safety: boolean; transfer: boolean; retention: boolean; baseline: number | null; trained: number | null; evaluatorVersion: string; suites: string }>()
      for (const row of list) {
        const k = key(row)
        const at = new Date(String(row.created_at || 0)).getTime() || 0
        const current = latestByKey.get(k)
        if (current && current.at > at) continue
        latestByKey.set(k, { at, improved: row.holdout_improved === true, safety: row.safety_passed === true, transfer: row.unseen_transfer_passed === true, retention: row.delayed_retention_passed === true, baseline: Number.isFinite(Number(row.baseline_score)) ? Number(row.baseline_score) : null, trained: Number.isFinite(Number(row.trained_artifact_score)) ? Number(row.trained_artifact_score) : null, evaluatorVersion: text(row.evaluator_version, 120), suites: [row.safety_suite_hash, row.transfer_suite_hash, row.retention_suite_hash].map(v => text(v, 64).toLowerCase()).join(':') })
      }
      return { latestByKey }
    }),
    chapter(async () => {
      const list = await forCohort('cos_university_residency_enrollments', 'candidate_id,trained_artifact_hash,standing')
      return {
        enrolled: new Set(list.map(key)),
        complete: new Set(list.filter((r: any) => text(r.standing, 60) === 'residency_complete').map(key)),
      }
    }),
    chapter(async () => {
      const list = await forCohort('cos_university_graduate_model_registry', 'candidate_id,trained_artifact_hash,promoted_at,activated_at')
      return {
        promoted: new Set(list.filter((r: any) => iso(r.promoted_at)).map(key)),
        activated: new Set(list.filter((r: any) => iso(r.activated_at)).map(key)),
        promotedAt: new Map(list.filter((r: any) => iso(r.promoted_at)).map((r: any) => [key(r), iso(r.promoted_at) as string])),
      }
    }),
    chapter(async () => ({ candidates: new Set((await forCohort('cos_workforce_roster', 'candidate_id,trained_artifact_hash')).map(key)) })),
    chapter(async () => {
      const list = await forCohort('cos_university_graduate_serving_attempts', 'candidate_id,trained_artifact_hash,phase,outcome', FUNNEL_ROWS_PER_CHUNK, q => q.neq('phase', 'attempt_started'))
      return {
        attempted: new Set(list.map(key)),
        succeeded: new Set(list.filter((r: any) => text(r.outcome, 40) === 'success').map(key)),
      }
    }),
    chapter(async () => ({ candidates: new Set((await forCohort('cos_university_graduate_lifecycle_events', 'candidate_id,trained_artifact_hash', FUNNEL_ROWS_PER_CHUNK, q => q.eq('event_type', 'verified_outcome'))).map(key)) })),
    chapter(async () => {
      let q = db.from('cos_university_graduate_serving_attempts').select('attempt_id,phase,outcome,latency_ms,error_class,recorded_at')
      if (since) q = q.gte('recorded_at', since)
      const list = await exhaust(() => q.order('recorded_at', { ascending: false }))
      const terminalByAttempt = new Map<string, { outcome: string; latencyMs: number; errorClass: string | null }>()
      for (const row of list) {
        const attemptId = text(row.attempt_id, 80)
        if (!attemptId || terminalByAttempt.has(attemptId) || text(row.phase, 40) === 'attempt_started') continue
        terminalByAttempt.set(attemptId, { outcome: text(row.outcome, 40), latencyMs: Math.max(0, Number(row.latency_ms) || 0), errorClass: text(row.error_class, 120) || null })
      }
      return { terminalByAttempt }
    }),
    chapter(async () => {
      let q = db.from('cos_university_lifecycle_orchestration').select('station,stage_entered_at,stage_deadline_at,lease_until,terminal')
      if (subjectId) q = q.eq('subject_id', subjectId)
      const list = await exhaust(() => q.eq('terminal', false))
      return { rows: list.map((row: any) => Object.freeze({ station: text(row.station, 80), enteredAt: iso(row.stage_entered_at), deadlineAt: iso(row.stage_deadline_at), leaseUntil: iso(row.lease_until), terminal: row.terminal === true })) }
    }),
    chapter(async () => {
      let q = db.from('cos_university_lifecycle_transition_history').select('from_station,transitioned_at,duration_seconds,was_overdue')
      if (since) q = q.gte('transitioned_at', since)
      if (subjectId) q = q.eq('subject_id', subjectId)
      const list = await exhaust(() => q.order('transitioned_at', { ascending: false }))
      return { rows: list.map((row: any) => Object.freeze({ fromStation: text(row.from_station, 80), transitionedAt: iso(row.transitioned_at), durationSeconds: Number.isFinite(Number(row.duration_seconds)) ? Math.max(0, Number(row.duration_seconds)) : null, wasOverdue: row.was_overdue === true })) }
    }),
    chapter(async () => {
      // Exact artifact only: forCohort matches by candidate id, and an older artifact of the same candidate must not
      // lend its Residency standings or case verdicts to the artifact in this cohort.
      const enrollments = (await forCohort('cos_university_residency_enrollments', 'id,candidate_id,trained_artifact_hash,standing'))
        .filter((row: any) => cohortKeys.has(key(row)))
      const residencyIds = enrollments.map((row: any) => text(row.id, 80)).filter(Boolean)
      const caseRows: any[] = [], competencyRows: any[] = []
      for (const chunk of chunks(residencyIds, FUNNEL_READ_CHUNK)) {
        caseRows.push(...await allRows((from, to) => db.from('cos_university_residency_case_runs').select('residency_id,status,harness_outcome,failure_code,metadata').in('residency_id', chunk).range(from, to)))
        competencyRows.push(...await allRows((from, to) => db.from('cos_university_residency_competency_evidence').select('residency_id,competency_id,outcome').in('residency_id', chunk).range(from, to)))
      }
      return {
        enrollments: enrollments.map((row: any) => ({ key: key(row), standing: text(row.standing, 60) })),
        caseStatuses: caseRows.map((row: any) => text(row.status, 40)),
        competencyOutcomes: competencyRows.map((row: any) => text(row.outcome, 20)),
        caseRuns: caseRows.map((row: any) => ({ status: text(row.status, 40), harnessOutcome: text(row.harness_outcome, 60), failureCode: text(row.failure_code, 80), ...builderLoopStop(row.metadata) })),
        competencyFailures: competencyRows.filter((row: any) => text(row.outcome, 20) === 'fail').map((row: any) => text(row.competency_id, 80) || 'unrecorded'),
      }
    }),
    chapter(async () => {
      const certs = await forCohort('cos_university_artifact_birth_certificates', 'candidate_id,trained_artifact_hash,permanent_artifact_id')
      const permanentIds = certs.map((row: any) => text(row.permanent_artifact_id, 80)).filter(Boolean)
      const list: any[] = []
      for (const chunk of chunks(permanentIds, FUNNEL_READ_CHUNK)) list.push(...await allRows((from, to) => db.from('cos_workforce_assignments').select('registry_id,permanent_artifact_id,source_kind,status,assigned_at').in('permanent_artifact_id', chunk).range(from, to)))
      return { rows: list.map((row: any) => ({ status: text(row.status, 40), sourceKind: text(row.source_kind, 40), permanentArtifactId: text(row.permanent_artifact_id, 80) })) }
    }),
    chapter(async () => {
      const list = await forCohort('cos_university_mass_distillation_provider_jobs', 'candidate_id,operation,observed_cost_usd,settled_at', FUNNEL_ROWS_PER_CHUNK)
      return { rows: list.filter((row: any) => iso(row.settled_at) && Number.isFinite(Number(row.observed_cost_usd))).map((row: any) => ({ operation: text(row.operation, 40), observedCostUsd: Math.max(0, Number(row.observed_cost_usd)) })) }
    }),
    chapter(async () => {
      const [certs, grads, resumes] = await Promise.all([
        forCohort('cos_university_artifact_birth_certificates', 'candidate_id,trained_artifact_hash'),
        forCohort('cos_university_graduate_model_registry', 'candidate_id,trained_artifact_hash'),
        forCohort('cos_university_graduate_resumes', 'candidate_id,trained_artifact_hash'),
      ])
      return { certificates: new Set(certs.map(key)), graduates: new Set(grads.map(key)), resumes: new Set(resumes.map(key)) }
    }),
    chapter(async () => {
      let assuranceQuery = db.from('cos_university_learning_assurance_events').select('authority_expanded,observed_at')
      if (since) assuranceQuery = assuranceQuery.gte('observed_at', since)
      const assuranceRows = await exhaust(() => assuranceQuery.order('observed_at', { ascending: false }))
      let patrolQuery = db.from('security_repository_patrol_evidence').select('engagement_id,chain_index,previous_hash,entry_hash,recorded_at')
      if (since) patrolQuery = patrolQuery.gte('recorded_at', since)
      const patrolRows = await exhaust(() => patrolQuery.order('recorded_at', { ascending: true }))
      const byEngagement = new Map<string, any[]>()
      for (const row of patrolRows) {
        const id = text(row.engagement_id, 200)
        const list = byEngagement.get(id) || []
        list.push(row); byEngagement.set(id, list)
      }
      let chainValid: boolean | null = patrolRows.length ? true : null
      for (const list of byEngagement.values()) {
        list.sort((a, b) => Number(a.chain_index) - Number(b.chain_index))
        for (let i = 0; i < list.length; i += 1) {
          if (Number(list[i].chain_index) !== Number(list[0].chain_index) + i) chainValid = false
          if (i > 0 && text(list[i].previous_hash, 64) !== text(list[i - 1].entry_hash, 64)) chainValid = false
        }
      }
      return { authorityExpansionObserved: assuranceRows.filter((row: any) => row.authority_expanded === true).length, assuranceEvents: assuranceRows.length, repositoryEvidenceEntries: patrolRows.length, repositoryEvidenceChainValid: chainValid }
    }),
    chapter(async () => ({ snapshot: await readUniversityMassDistillationHealth({ db, now }) })),
    chapter(async () => {
      // Evaluation failures recorded IN THE WINDOW (an operations figure, not a cohort figure): every terminal FAILED
      // evaluation event (event_type fine_tune, claim ..._failed), its error classified by the rolling authority's rule.
      let q = db.from('cos_university_learning_assurance_events').select('evidence').eq('event_type', 'fine_tune')
      if (since) q = q.gte('observed_at', since)
      const list = await exhaust(() => q.order('observed_at', { ascending: false }))
      return { errors: list.filter((r: any) => r.evidence?.claim === EVALUATION_FAILED_CLAIM).map((r: any) => text(r.evidence?.error, 200)).filter(Boolean) }
    }),
  ])

  // Read on its own so a missing ledger (migration not yet applied) names its own chapter and touches nothing else.
  const operatorActions = await chapter(async () => {
    const installed = await rows(db.from('cos_university_operator_actions').select('occurred_at').eq('source', 'ledger_installed').order('occurred_at', { ascending: true }).limit(1))
    let q = db.from('cos_university_operator_actions').select('source,target,operation,occurred_at').neq('source', 'ledger_installed')
    if (since) q = q.gte('occurred_at', since)
    const list = await exhaust(() => q.order('occurred_at', { ascending: false }))
    return {
      installedAt: iso(installed[0]?.occurred_at),
      rows: list.map((row: any) => Object.freeze({ source: text(row.source, 40), target: text(row.target, 160), operation: text(row.operation, 80), occurredAt: iso(row.occurred_at) })),
    }
  })

  return composeFunnel({ now, window, since, subjectId, cohort, truncated, production, certified, examined, residency, graduation, hired, work, verified, serving, lineLedger, transitionHistory, residencyEvidence, workforceAssignments, providerCosts, provenanceEvidence, governanceEvidence, operationalHealth, evaluationFailures, operatorActions })
}

/** One line: the funnel's top, its bottom, and the honesty row. */
export function describeFunnel(funnel: EffectivenessFunnel): string {
  const get = (id: string) => funnel.stages.find(s => s.id === id)?.count ?? 0
  const pct = (id: string) => { const s = funnel.stages.find(x => x.id === id); return s && s.share !== null ? `${Math.round(s.share * 100)}%` : 'n/a' }
  return `funnel window=${funnel.window}${funnel.subjectId ? ` subject=${funnel.subjectId}` : ''} born=${funnel.cohort.size}${funnel.cohort.truncated ? '+' : ''} `
    + `examined=${get('examined')} (${pct('examined')}) passed_all=${get('passed_all_gates')} (${pct('passed_all_gates')}) graduated=${get('graduated')} (${pct('graduated')}) `
    + `hired=${get('hired')} worked=${get('performed_work')} verified=${get('verified_outcome')} (${pct('verified_outcome')}) `
    + (funnel.capabilityGain.available ? `| gain n=${funnel.capabilityGain.sampleSize} mean=${funnel.capabilityGain.meanAbsoluteGain === null ? 'n/a' : funnel.capabilityGain.meanAbsoluteGain.toFixed(4)} positive=${funnel.capabilityGain.positiveGainRate === null ? 'n/a' : Math.round(funnel.capabilityGain.positiveGainRate * 100) + '%'} ` : '| gain unavailable ')
    + (funnel.reliability.available ? `| reliability attempts=${funnel.reliability.attempts} success=${funnel.reliability.successRate === null ? 'n/a' : Math.round(funnel.reliability.successRate * 100) + '%'} p90=${funnel.reliability.p90LatencyMs === null ? 'n/a' : funnel.reliability.p90LatencyMs + 'ms'} ` : '| reliability unavailable ')
    + (funnel.lineHealth.available ? `| line live=${funnel.lineHealth.liveUnits} overdue=${funnel.lineHealth.overdueUnits} leased=${funnel.lineHealth.leasedUnits} bottleneck=${funnel.lineHealth.bottleneckStation || 'none'} ` : '| line unavailable ')
    + (funnel.lineHistory.available ? `| flow transitions=${funnel.lineHistory.transitions} throughput=${funnel.lineHistory.throughputPerHour === null ? 'n/a' : funnel.lineHistory.throughputPerHour.toFixed(2) + '/h'} recovered=${funnel.lineHistory.recoveredOverdue} ` : '| flow history unavailable ')
    + (funnel.residencyEffectiveness.available ? `| residency complete=${funnel.residencyEffectiveness.completed}/${funnel.residencyEffectiveness.enrollments} cases=${funnel.residencyEffectiveness.caseRuns} ` : '| residency evidence unavailable ')
    + (funnel.workforceEffectiveness.available ? `| workforce assignments=${funnel.workforceEffectiveness.assignments} verified=${funnel.workforceEffectiveness.verified} remediation=${funnel.workforceEffectiveness.remediation} runtime_failed=${funnel.workforceEffectiveness.runtimeFailed} ` : '| workforce evidence unavailable ')
    + (funnel.economics.available ? `| observed_provider_cost=${funnel.economics.observedProviderCostUsd.toFixed(2)} settled_jobs=${funnel.economics.settledProviderJobs} ` : '| economics unavailable ')
    + (funnel.provenance.available ? `| provenance traceable_graduates=${funnel.provenance.traceableGraduates}/${funnel.provenance.graduates} ` : '| provenance unavailable ')
    + `| rejected quarantined=${funnel.rejected.quarantined} retired=${funnel.rejected.retired}`
    + (funnel.evaluationFailures.available ? ` | eval failures=${funnel.evaluationFailures.total} infra=${funnel.evaluationFailures.infrastructure} merit=${funnel.evaluationFailures.merit}` : ' | eval failures unavailable')
    + (Object.keys(funnel.unavailable).length ? ` | unavailable=${Object.keys(funnel.unavailable).join(',')}` : '')
}
// end of saas/lib/ai/cos/cosUniversityEffectivenessFunnel.ts (if this line is missing, the paste was cut short)
