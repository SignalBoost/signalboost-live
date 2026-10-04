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

export const FUNNEL_SCHEMA_VERSION = 'cos-university-effectiveness-funnel-v1' as const
/** How many artifacts one funnel follows. Beyond this the report says it is truncated instead of guessing. */
export const FUNNEL_COHORT_LIMIT = 1500
/** Ids per `in()` read. Candidate ids are short; this stays well inside a URL. */
export const FUNNEL_READ_CHUNK = 100
/** Rows read per chunk from the high-volume tables (attempts, events). Counted, never listed. */
export const FUNNEL_ROWS_PER_CHUNK = 5000

/** The terminal claim the evaluation route writes on a failed exam (cos-university-mass-distilled-evaluation FAILED). */
export const EVALUATION_FAILED_CLAIM = 'mass_distilled_independent_evaluation_failed' as const

export type FunnelWindow = '24h' | '7d' | '30d' | 'all'
export const FUNNEL_WINDOWS: readonly FunnelWindow[] = Object.freeze(['24h', '7d', '30d', 'all'])
const WINDOW_HOURS: Readonly<Record<FunnelWindow, number | null>> = Object.freeze({ '24h': 24, '7d': 168, '30d': 720, all: null })

type Db = { from: (table: string) => any }

const text = (value: unknown, max = 200): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
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
  evaluationFailures: Chapter<{
    total: number
    infrastructure: number
    merit: number
    byReason: Readonly<Record<string, number>>
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
})

/** Pure: compose the funnel from the cohort and the per-table facts. Exported so the arithmetic is testable alone. */
export function composeFunnel(input: {
  now: Date
  window: FunnelWindow
  since: string | null
  subjectId: string | null
  cohort: readonly Readonly<{ candidateId: string; hash: string; status: string }>[]
  truncated: boolean
  production: Chapter<{ runsStarted: number; runsCompleted: number; runsFailed: number }>
  certified: Chapter<{ candidates: ReadonlySet<string> }>
  examined: Chapter<{ latestByKey: ReadonlyMap<string, { improved: boolean; safety: boolean; transfer: boolean; retention: boolean; baseline: number | null; trained: number | null }> }>
  residency: Chapter<{ enrolled: ReadonlySet<string>; complete: ReadonlySet<string> }>
  graduation: Chapter<{ promoted: ReadonlySet<string>; activated: ReadonlySet<string> }>
  hired: Chapter<{ candidates: ReadonlySet<string> }>
  work: Chapter<{ attempted: ReadonlySet<string>; succeeded: ReadonlySet<string> }>
  verified: Chapter<{ candidates: ReadonlySet<string> }>
  evaluationFailures: Chapter<{ errors: readonly string[] }>
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
    const points = input.cohort.flatMap(a => {
      const r = input.examined.latestByKey.get(keyOf(a))
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

  let evaluationFailures: EffectivenessFunnel['evaluationFailures']
  if (input.evaluationFailures.available) {
    const byReason: Record<string, number> = {}
    let infrastructure = 0
    for (const error of input.evaluationFailures.errors) {
      const family = text(error, 80).split(':').slice(0, 2).join(':')
      byReason[family] = (byReason[family] || 0) + 1
      if (isEvaluatorInfrastructureFailure(error)) infrastructure += 1
    }
    evaluationFailures = Object.freeze({
      available: true as const, error: null,
      total: input.evaluationFailures.errors.length,
      infrastructure,
      merit: input.evaluationFailures.errors.length - infrastructure,
      byReason: Object.freeze(byReason),
      source: SOURCE.assurance,
      rule: 'cosUniversityMassEvaluationRollingAuthority.isEvaluatorInfrastructureFailure',
    })
  } else {
    evaluationFailures = Object.freeze({ available: false as const, error: input.evaluationFailures.error })
  }

  return Object.freeze({
    schemaVersion: FUNNEL_SCHEMA_VERSION,
    generatedAt: input.now.toISOString(),
    window: input.window,
    since: input.since,
    subjectId: input.subjectId,
    cohort: Object.freeze({ size, truncated: input.truncated, source: SOURCE.artifacts }),
    production,
    capabilityGain,
    stages: Object.freeze(stages),
    unavailable: Object.freeze(unavailable),
    rejected: Object.freeze({ quarantined: byStatus.quarantined || 0, retired: byStatus.retired || 0, byStatus: Object.freeze(byStatus), source: SOURCE.artifacts }),
    evaluationFailures,
    authorityExpanded: false as const,
  })
}

async function chapter<T>(read: () => Promise<T>): Promise<Chapter<T>> {
  try { return Object.freeze({ available: true as const, error: null, ...(await read()) }) }
  catch (error) { return Object.freeze({ available: false as const, error: text(error instanceof Error ? error.message : error, 300) }) }
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
  }))
  const candidateIds = Array.from(new Set(cohort.map(a => a.candidateId))).filter(Boolean)
  const key = (row: any) => `${text(row.candidate_id, 240)}:${text(row.trained_artifact_hash, 64).toLowerCase()}`

  /** Read one table for the whole cohort, chunked by candidate id. */
  const forCohort = async (table: string, columns: string, limit = FUNNEL_READ_CHUNK * 10, refine?: (q: any) => any): Promise<any[]> => {
    const out: any[] = []
    for (const chunk of chunks(candidateIds, FUNNEL_READ_CHUNK)) {
      let q = db.from(table).select(columns).in('candidate_id', chunk)
      if (refine) q = refine(q)
      out.push(...await rows(q.limit(limit)))
    }
    return out
  }

  const [production, certified, examined, residency, graduation, hired, work, verified, evaluationFailures] = await Promise.all([
    chapter(async () => {
      let q = db.from('cos_university_mass_distillation_batch_runs').select('stage')
      if (since) q = q.gte('created_at', since)
      if (subjectId) q = q.eq('subject_id', subjectId)
      const list = await rows(q.limit(FUNNEL_ROWS_PER_CHUNK))
      const stageOf = (row: any) => text(row.stage, 60)
      return {
        runsStarted: list.length,
        runsCompleted: list.filter(r => stageOf(r) === 'complete').length,
        runsFailed: list.filter(r => stageOf(r) === 'failed').length,
      }
    }),
    chapter(async () => ({ candidates: new Set((await forCohort('cos_university_artifact_birth_certificates', 'candidate_id')).map((r: any) => text(r.candidate_id, 240))) })),
    chapter(async () => {
      const list = await forCohort('cos_university_distilled_evaluation_runs', 'candidate_id,trained_artifact_hash,created_at,baseline_score,trained_artifact_score,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed', FUNNEL_ROWS_PER_CHUNK)
      // Latest run per exact artifact decides the stage; an earlier failure that a later run cleared is not a failure.
      const latestByKey = new Map<string, { at: number; improved: boolean; safety: boolean; transfer: boolean; retention: boolean; baseline: number | null; trained: number | null }>()
      for (const row of list) {
        const k = key(row)
        const at = new Date(String(row.created_at || 0)).getTime() || 0
        const current = latestByKey.get(k)
        if (current && current.at > at) continue
        latestByKey.set(k, { at, improved: row.holdout_improved === true, safety: row.safety_passed === true, transfer: row.unseen_transfer_passed === true, retention: row.delayed_retention_passed === true, baseline: Number.isFinite(Number(row.baseline_score)) ? Number(row.baseline_score) : null, trained: Number.isFinite(Number(row.trained_artifact_score)) ? Number(row.trained_artifact_score) : null })
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
      // Evaluation failures recorded IN THE WINDOW (an operations figure, not a cohort figure): every terminal FAILED
      // evaluation event (event_type fine_tune, claim ..._failed), its error classified by the rolling authority's rule.
      let q = db.from('cos_university_learning_assurance_events').select('evidence').eq('event_type', 'fine_tune')
      if (since) q = q.gte('observed_at', since)
      const list = await rows(q.order('observed_at', { ascending: false }).limit(FUNNEL_ROWS_PER_CHUNK))
      return { errors: list.filter((r: any) => r.evidence?.claim === EVALUATION_FAILED_CLAIM).map((r: any) => text(r.evidence?.error, 200)).filter(Boolean) }
    }),
  ])

  return composeFunnel({ now, window, since, subjectId, cohort, truncated, production, certified, examined, residency, graduation, hired, work, verified, evaluationFailures })
}

/** One line: the funnel's top, its bottom, and the honesty row. */
export function describeFunnel(funnel: EffectivenessFunnel): string {
  const get = (id: string) => funnel.stages.find(s => s.id === id)?.count ?? 0
  const pct = (id: string) => { const s = funnel.stages.find(x => x.id === id); return s && s.share !== null ? `${Math.round(s.share * 100)}%` : 'n/a' }
  return `funnel window=${funnel.window}${funnel.subjectId ? ` subject=${funnel.subjectId}` : ''} born=${funnel.cohort.size}${funnel.cohort.truncated ? '+' : ''} `
    + `examined=${get('examined')} (${pct('examined')}) passed_all=${get('passed_all_gates')} (${pct('passed_all_gates')}) graduated=${get('graduated')} (${pct('graduated')}) `
    + `hired=${get('hired')} worked=${get('performed_work')} verified=${get('verified_outcome')} (${pct('verified_outcome')}) `
    + (funnel.capabilityGain.available ? `| gain n=${funnel.capabilityGain.sampleSize} mean=${funnel.capabilityGain.meanAbsoluteGain === null ? 'n/a' : funnel.capabilityGain.meanAbsoluteGain.toFixed(4)} positive=${funnel.capabilityGain.positiveGainRate === null ? 'n/a' : Math.round(funnel.capabilityGain.positiveGainRate * 100) + '%'} ` : '| gain unavailable ')
    + `| rejected quarantined=${funnel.rejected.quarantined} retired=${funnel.rejected.retired}`
    + (funnel.evaluationFailures.available ? ` | eval failures=${funnel.evaluationFailures.total} infra=${funnel.evaluationFailures.infrastructure} merit=${funnel.evaluationFailures.merit}` : ' | eval failures unavailable')
    + (Object.keys(funnel.unavailable).length ? ` | unavailable=${Object.keys(funnel.unavailable).join(',')}` : '')
}
// end of saas/lib/ai/cos/cosUniversityEffectivenessFunnel.ts (if this line is missing, the paste was cut short)
