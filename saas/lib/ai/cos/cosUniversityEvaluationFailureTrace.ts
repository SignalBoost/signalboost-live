// saas/lib/ai/cos/cosUniversityEvaluationFailureTrace.ts
//
// Read-only trace of evaluation failures over time. Owner 2026-10-06: Step 1 order of work starts with evaluation
// infrastructure failures (7 days: 1,334 failures, 88% infrastructure). The Step 1 report counts failures by reason
// family over a whole window, which cannot tell a cause that stopped two days ago from one still firing, and its family
// key (first two segments) drops the `:workers=<stage>` suffix that says WHY a runtime never became ready:
//   cold          RunPod never reported a worker (GPU supply / worker quota)
//   initializing  a worker started but never became running (image pull / model load)
//   warm          a worker was running but the gateway never answered (in-container load / gateway)
//   unknown       no control-plane health read succeeded during the window
//   unrecorded    the failure predates the stage suffix
//
// Per family: total, infrastructure or merit (the rolling authority's own rule), per-UTC-day counts and the last time
// it was seen. Counts only: no candidate ids, prompts or answers leave this module.
import { isEvaluatorInfrastructureFailure } from './cosUniversityMassEvaluationRollingAuthority.ts'

export const EVALUATION_FAILURE_TRACE_SCHEMA_VERSION = 'cos-university-evaluation-failure-trace-v1' as const
export const EVALUATION_FAILURE_TRACE_DAYS = 7
export const EVALUATION_FAILURE_TRACE_ROW_LIMIT = 20000
const EVALUATION_FAILED_CLAIM = 'mass_distilled_independent_evaluation_failed'
const EVALUATION_COMPLETED_CLAIM = 'mass_distilled_independent_evaluation_completed'
/** The evaluator's readiness window (cosUniversityMassDistilledArtifactEvaluation READY_TIMEOUT_MS). */
export const EVALUATION_READY_WINDOW_SECONDS = 280
const READINESS_BUCKETS: readonly number[] = Object.freeze([60, 120, 180, 240, EVALUATION_READY_WINDOW_SECONDS])
const PAGE = 1000

type Db = { from: (table: string) => any }

const text = (value: unknown, max = 300): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export type FailureRow = Readonly<{ observed_at: unknown; error: unknown }>
export type CompletedRow = Readonly<{ observed_at: unknown; readiness_seconds: unknown }>

/** How long COMPLETED exams waited for the exact artifact's runtime, against the window failed exams ran out of. */
export type ReadinessWaits = Readonly<{
  completed: number
  withReadiness: number
  p50: number | null
  p90: number | null
  max: number | null
  /** Cumulative: completed exams that became ready within N seconds. */
  withinSeconds: Readonly<Record<string, number>>
  windowSeconds: number
}>
export type RuntimeStage = 'cold' | 'initializing' | 'warm' | 'unknown' | 'unrecorded'

export type FailureFamily = Readonly<{
  family: string
  total: number
  attribution: 'infrastructure' | 'merit'
  lastSeenAt: string | null
  perDay: Readonly<Record<string, number>>
  last24h: number
  /** Most frequent full error patterns in the family (case hashes blanked), with counts. */
  details: readonly Readonly<{ detail: string; count: number }>[]
}>

export type EvaluationFailureTrace = Readonly<{
  schemaVersion: typeof EVALUATION_FAILURE_TRACE_SCHEMA_VERSION
  generatedAt: string
  since: string
  days: readonly string[]
  total: number
  truncated: boolean
  infrastructure: number
  merit: number
  perDay: Readonly<Record<string, Readonly<{ infrastructure: number; merit: number }>>>
  families: readonly FailureFamily[]
  runtimeNotReadyStages: Readonly<Record<RuntimeStage, number>>
  readiness: ReadinessWaits | null
  readOnly: true
}>

/**
 * First two colon segments, like the Step 1 report, except that a per-case hash in the second segment
 * (`answer_missing:2ebc8bff9f2052e9`) collapses to `<case>` so one cause is one family, not one family per case.
 */
export function failureFamily(error: unknown): string {
  const [first = '', second] = text(error, 80).split(':')
  if (!first) return 'unclassified'
  if (second === undefined) return first
  return `${first}:${/^[0-9a-f]{8,}$/i.test(second.trim()) ? '<case>' : second}`
}

/** The full error with per-case hashes blanked, so identical causes on different cases read as one pattern. */
export function failureDetail(error: unknown): string {
  return text(error, 600).replace(/\b[0-9a-f]{8,}\b/gi, '<case>').slice(0, 160)
}

/** Pure: completed-exam readiness waits. */
export function composeReadinessWaits(rows: readonly CompletedRow[]): ReadinessWaits {
  const waits = rows
    // A missing value is unknown, never a zero-second wait (Number(null) is 0).
    .map(row => row.readiness_seconds === null || row.readiness_seconds === undefined || String(row.readiness_seconds).trim() === '' ? Number.NaN : Number(row.readiness_seconds))
    .filter(value => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b)
  const pick = (q: number) => waits.length ? waits[Math.min(waits.length - 1, Math.max(0, Math.ceil(q * waits.length) - 1))] : null
  const withinSeconds: Record<string, number> = {}
  for (const bucket of READINESS_BUCKETS) withinSeconds[String(bucket)] = waits.filter(value => value <= bucket).length
  return Object.freeze({
    completed: rows.length,
    withReadiness: waits.length,
    p50: pick(0.5),
    p90: pick(0.9),
    max: waits.length ? waits[waits.length - 1] : null,
    withinSeconds: Object.freeze(withinSeconds),
    windowSeconds: EVALUATION_READY_WINDOW_SECONDS,
  })
}

/** The worker stage a runtime_not_ready failure recorded, or `unrecorded` when it predates the suffix. */
export function runtimeStage(error: unknown): RuntimeStage {
  const match = /:workers=(cold|initializing|warm|unknown)\b/.exec(text(error, 600))
  return match ? match[1] as RuntimeStage : 'unrecorded'
}

const dayOf = (iso: string) => iso.slice(0, 10)

export function composeEvaluationFailureTrace(input: { rows: readonly FailureRow[]; truncated: boolean; now: Date; days?: number; completed?: readonly CompletedRow[] | null }): EvaluationFailureTrace {
  const dayCount = input.days ?? EVALUATION_FAILURE_TRACE_DAYS
  const nowMs = input.now.getTime()
  const since = new Date(nowMs - dayCount * 86_400_000).toISOString()
  const days: string[] = []
  for (let i = dayCount; i >= 0; i -= 1) days.push(dayOf(new Date(nowMs - i * 86_400_000).toISOString()))
  const perDay: Record<string, { infrastructure: number; merit: number }> = {}
  for (const day of days) perDay[day] = { infrastructure: 0, merit: 0 }

  const families = new Map<string, { total: number; infra: number; last: string | null; perDay: Record<string, number>; last24h: number; details: Map<string, number> }>()
  const stages: Record<RuntimeStage, number> = { cold: 0, initializing: 0, warm: 0, unknown: 0, unrecorded: 0 }
  let infrastructure = 0
  let total = 0
  for (const row of input.rows) {
    const error = text(row.error, 600)
    if (!error) continue
    const atMs = Date.parse(String(row.observed_at ?? ''))
    if (!Number.isFinite(atMs)) continue
    const at = new Date(atMs).toISOString()
    total += 1
    const infra = isEvaluatorInfrastructureFailure(error)
    if (infra) infrastructure += 1
    const day = dayOf(at)
    if (perDay[day]) perDay[day][infra ? 'infrastructure' : 'merit'] += 1
    const key = failureFamily(error)
    const entry = families.get(key) || { total: 0, infra: 0, last: null, perDay: {}, last24h: 0, details: new Map<string, number>() }
    const detail = failureDetail(error)
    entry.details.set(detail, (entry.details.get(detail) || 0) + 1)
    entry.total += 1
    if (infra) entry.infra += 1
    if (!entry.last || at > entry.last) entry.last = at
    entry.perDay[day] = (entry.perDay[day] || 0) + 1
    if (nowMs - atMs <= 86_400_000) entry.last24h += 1
    families.set(key, entry)
    if (key.includes('runtime_not_ready')) stages[runtimeStage(error)] += 1
  }

  const list: FailureFamily[] = [...families.entries()]
    .map(([family, e]) => Object.freeze({
      family,
      total: e.total,
      // A family is reported by the majority rule of its members; mixed families are rare and still counted per row above.
      attribution: e.infra * 2 >= e.total ? 'infrastructure' as const : 'merit' as const,
      lastSeenAt: e.last,
      perDay: Object.freeze({ ...e.perDay }),
      last24h: e.last24h,
      details: Object.freeze([...e.details.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([detail, count]) => Object.freeze({ detail, count }))),
    }))
    .sort((a, b) => b.total - a.total || a.family.localeCompare(b.family))

  return Object.freeze({
    schemaVersion: EVALUATION_FAILURE_TRACE_SCHEMA_VERSION,
    generatedAt: input.now.toISOString(),
    since,
    days: Object.freeze(days),
    total,
    truncated: input.truncated,
    infrastructure,
    merit: total - infrastructure,
    perDay: Object.freeze(perDay),
    families: Object.freeze(list),
    runtimeNotReadyStages: Object.freeze(stages),
    readiness: input.completed ? composeReadinessWaits(input.completed) : null,
    readOnly: true as const,
  })
}

async function rows(query: any): Promise<any[]> {
  const result = await query
  if (result?.error) throw result.error
  return Array.isArray(result?.data) ? result.data : []
}

export async function readEvaluationFailureTrace(input: { db: Db; now?: Date; days?: number }): Promise<EvaluationFailureTrace> {
  const now = input.now ?? new Date()
  const days = input.days ?? EVALUATION_FAILURE_TRACE_DAYS
  const since = new Date(now.getTime() - days * 86_400_000).toISOString()
  const out: any[] = []
  let truncated = true
  for (let from = 0; from < EVALUATION_FAILURE_TRACE_ROW_LIMIT; from += PAGE) {
    const page = await rows(input.db.from('cos_university_learning_assurance_events')
      .select('observed_at,error:evidence->>error')
      .eq('event_type', 'fine_tune')
      .eq('evidence->>claim', EVALUATION_FAILED_CLAIM)
      .gte('observed_at', since)
      .order('observed_at', { ascending: false })
      .range(from, from + PAGE - 1))
    out.push(...page)
    if (page.length < PAGE) { truncated = false; break }
  }
  // Completed exams in the same window, for their readiness wait. Recorded since 2026-10-05; older rows carry none.
  // Its own failure never hides the failure trace.
  let completed: any[] | null = null
  try {
    completed = []
    for (let from = 0; from < EVALUATION_FAILURE_TRACE_ROW_LIMIT; from += PAGE) {
      const page = await rows(input.db.from('cos_university_learning_assurance_events')
        .select('observed_at,readiness_seconds:evidence->>readinessSeconds')
        .eq('event_type', 'fine_tune')
        .eq('evidence->>claim', EVALUATION_COMPLETED_CLAIM)
        .gte('observed_at', since)
        .order('observed_at', { ascending: false })
        .range(from, from + PAGE - 1))
      completed.push(...page)
      if (page.length < PAGE) break
    }
  } catch {
    completed = null
  }
  return composeEvaluationFailureTrace({ rows: out, truncated, now, days, completed })
}

/** A block a human reads in a CI log or check run. */
export function describeEvaluationFailureTrace(trace: EvaluationFailureTrace, topFamilies = 15): string {
  const dayCols = trace.days.map(day => day.slice(5))
  const lines = [
    `EVALUATION FAILURES since ${trace.since.slice(0, 16)}Z: total=${trace.total}${trace.truncated ? '+ (truncated)' : ''} infrastructure=${trace.infrastructure} merit=${trace.merit}`,
    `  per day (infra/merit): ${trace.days.map(day => `${day.slice(5)}=${trace.perDay[day]?.infrastructure ?? 0}/${trace.perDay[day]?.merit ?? 0}`).join(' ')}`,
    `  runtime_not_ready worker stage: ${Object.entries(trace.runtimeNotReadyStages).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `  family | attribution | total | last24h | last seen | per day ${dayCols.join(' ')}`,
  ]
  for (const family of trace.families.slice(0, topFamilies)) {
    lines.push(`  ${family.family} | ${family.attribution} | ${family.total} | ${family.last24h} | ${family.lastSeenAt ? family.lastSeenAt.slice(0, 16) + 'Z' : 'n/a'} | ${trace.days.map(day => family.perDay[day] ?? 0).join(' ')}`)
  }
  if (trace.families.length > topFamilies) lines.push(`  ... ${trace.families.length - topFamilies} more families`)
  const r = trace.readiness
  lines.push(r
    ? `  completed-exam readiness wait (window ${r.windowSeconds}s): completed=${r.completed} withReadiness=${r.withReadiness} p50=${r.p50 ?? 'n/a'}s p90=${r.p90 ?? 'n/a'}s max=${r.max ?? 'n/a'}s within ${Object.entries(r.withinSeconds).map(([k, v]) => `${k}s=${v}`).join(' ')}`
    : '  completed-exam readiness wait: unavailable')
  lines.push('  detail of families still firing in the last 24h, plus the top 5 overall:')
  const detailed = trace.families.filter((family, index) => family.last24h > 0 || index < 5)
  for (const family of detailed) {
    lines.push(`    ${family.family}:`)
    for (const entry of family.details) lines.push(`      ${entry.count} x ${entry.detail}`)
  }
  return lines.join('\n')
}
// end of saas/lib/ai/cos/cosUniversityEvaluationFailureTrace.ts (if this line is missing, the paste was cut short)
