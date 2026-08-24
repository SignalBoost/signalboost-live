//
// "IS COS STILL LEARNING?" — the standing watchdog, not a one-off query.
//
// Every existing signal answers a weaker question. A green build proves the app compiles. A merged
// PR proves text changed. Rows in cos_continuous_learning prove something was learned ONCE. None of
// them notice the day the daily cycle quietly stops producing anything, because nothing looks
// different from the outside: the dashboards keep rendering the corpus that already exists.
//
// This module answers the narrow question — did the learning cycle keep running, keep retaining, and
// keep reaching NEW subjects — and it is deliberately pessimistic. Learning failures are silent by
// nature, so an ambiguous signal is never reported as healthy.
//
// PURE AND MODEL-FREE. The caller supplies the corpus rows and the gap-status counts; this decides
// the verdict. The numbers are the part that can lie, so all of the honesty rules live here where
// they are under test.

/** One retained corpus row. created_at is when COS LEARNED it; observed_at is when the SOURCE was published. */
export type RetentionRow = {
  created_at?: string | null
  subject?: string | null
  source_kind?: string | null
}

/** Grouped counts from cos_learning_gaps: how many durable reasoning gaps sit in each status. */
export type GapStatusCount = {
  status?: string | null
  count?: number | null
}

export type ContinuityStatus = 'green' | 'amber' | 'red' | 'no_data'

export type ContinuityFinding = {
  code: string
  severity: 'red' | 'amber' | 'info'
  title: string
  detail: string
}

export type DailyRetention = {
  date: string
  documents: number
  subjects: number
}

export type ContinuityReport = {
  status: ContinuityStatus
  generatedAt: string
  /** null when the corpus is empty — never reported as 0, which would read as "just learned". */
  lastRetentionAt: string | null
  hoursSinceLastRetention: number | null
  corpusDocuments: number
  documentsLast7Days: number
  documentsPrevious7Days: number
  distinctSubjectsLast7Days: number
  /** Subjects seen in the last 7 days that appear nowhere earlier — expansion, not reinforcement. */
  newSubjectsLast7Days: number
  newSubjects: string[]
  /** Days in the last 7 with zero retained documents. */
  silentDaysLast7: number
  dailyRetention: DailyRetention[]
  sourceKindsLast7Days: Array<{ sourceKind: string; documents: number }>
  trendDirection: 'up' | 'down' | 'flat' | 'unknown'
  openGaps: number
  resolvedGaps: number
  totalGaps: number
  findings: ContinuityFinding[]
  summary: string
}

export type ContinuityOptions = {
  now?: Date
  /** How often the learning cycle is scheduled. Freshness is judged in cycles, not hours. */
  cycleIntervalHours?: number
}

const DAY_MS = 86_400_000

/** The cron runs at 30 6 * * *. Two missed cycles is the point where "quiet" stops being plausible. */
export const DEFAULT_CYCLE_INTERVAL_HOURS = 24
export const STALE_CYCLES_BEFORE_RED = 2
/** Three silent days out of seven is a stopped pipeline, not a slow week. */
export const MAX_SILENT_DAYS_IN_7 = 2
/** Below this, week-over-week movement is noise and no direction is claimed. */
export const MINIMUM_DOCUMENTS_FOR_TREND = 6

function toDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function normalizeSubject(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function roundTo(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

/**
 * Judge whether COS is still learning, from retained evidence alone.
 *
 * Deliberate asymmetry: every rule can only make the verdict WORSE. There is no rule that upgrades a
 * red to a green because some other number looks good, because the whole failure mode this exists to
 * catch is one healthy-looking number masking a dead pipeline.
 */
export function assessLearningContinuity(
  corpus: RetentionRow[],
  gapStatusCounts: GapStatusCount[],
  options: ContinuityOptions = {},
): ContinuityReport {
  const now = options.now ?? new Date()
  const cycleHours = Math.max(1, options.cycleIntervalHours ?? DEFAULT_CYCLE_INTERVAL_HOURS)
  const generatedAt = now.toISOString()

  const rows = corpus
    .map(row => ({ at: toDate(row.created_at), subject: normalizeSubject(row.subject), sourceKind: String(row.source_kind ?? '').trim() }))
    .filter((row): row is { at: Date; subject: string; sourceKind: string } => row.at !== null)

  const gaps = gapStatusCounts.map(entry => ({
    status: String(entry.status ?? '').trim().toLowerCase(),
    count: Number(entry.count ?? 0) || 0,
  }))
  const totalGaps = gaps.reduce((sum, entry) => sum + entry.count, 0)
  const openGaps = gaps
    .filter(entry => entry.status === 'pending' || entry.status === 'learning')
    .reduce((sum, entry) => sum + entry.count, 0)
  const resolvedGaps = gaps
    .filter(entry => entry.status === 'resolved')
    .reduce((sum, entry) => sum + entry.count, 0)

  const findings: ContinuityFinding[] = []

  // An empty corpus is never green. It is not "no problems found" — it is no evidence at all, which
  // is the same shape a never-configured system has.
  if (rows.length === 0) {
    return {
      status: 'no_data',
      generatedAt,
      lastRetentionAt: null,
      hoursSinceLastRetention: null,
      corpusDocuments: 0,
      documentsLast7Days: 0,
      documentsPrevious7Days: 0,
      distinctSubjectsLast7Days: 0,
      newSubjectsLast7Days: 0,
      newSubjects: [],
      silentDaysLast7: 7,
      dailyRetention: [],
      sourceKindsLast7Days: [],
      trendDirection: 'unknown',
      openGaps,
      resolvedGaps,
      totalGaps,
      findings: [{
        code: 'empty_corpus',
        severity: 'red',
        title: 'No retained learning at all',
        detail: 'cos_continuous_learning contains no rows with a usable created_at. Either the daily cycle has never completed a retention, or the corpus was cleared. This is not a passing check with nothing to report.',
      }],
      summary: 'NO DATA — the durable corpus is empty, so there is nothing to prove COS has ever learned.',
    }
  }

  rows.sort((a, b) => b.at.getTime() - a.at.getTime())
  const lastRetention = rows[0].at
  const hoursSinceLastRetention = roundTo((now.getTime() - lastRetention.getTime()) / 3_600_000, 1)

  const sevenDaysAgo = now.getTime() - 7 * DAY_MS
  const fourteenDaysAgo = now.getTime() - 14 * DAY_MS

  const recent = rows.filter(row => row.at.getTime() >= sevenDaysAgo)
  const previous = rows.filter(row => row.at.getTime() >= fourteenDaysAgo && row.at.getTime() < sevenDaysAgo)
  const older = rows.filter(row => row.at.getTime() < sevenDaysAgo)

  const recentSubjects = new Set(recent.map(row => row.subject).filter(Boolean))
  const olderSubjects = new Set(older.map(row => row.subject).filter(Boolean))
  const newSubjects = [...recentSubjects].filter(subject => !olderSubjects.has(subject)).sort()

  const byDay = new Map<string, { documents: number; subjects: Set<string> }>()
  for (let offset = 6; offset >= 0; offset -= 1) {
    byDay.set(dayKey(new Date(now.getTime() - offset * DAY_MS)), { documents: 0, subjects: new Set() })
  }
  for (const row of recent) {
    const bucket = byDay.get(dayKey(row.at))
    if (!bucket) continue
    bucket.documents += 1
    if (row.subject) bucket.subjects.add(row.subject)
  }
  const dailyRetention: DailyRetention[] = [...byDay.entries()].map(([date, bucket]) => ({
    date,
    documents: bucket.documents,
    subjects: bucket.subjects.size,
  }))
  const silentDaysLast7 = dailyRetention.filter(day => day.documents === 0).length

  const sourceKindTotals = new Map<string, number>()
  for (const row of recent) {
    const kind = row.sourceKind || 'unknown'
    sourceKindTotals.set(kind, (sourceKindTotals.get(kind) ?? 0) + 1)
  }
  const sourceKindsLast7Days = [...sourceKindTotals.entries()]
    .map(([sourceKind, documents]) => ({ sourceKind, documents }))
    .sort((a, b) => b.documents - a.documents)

  // A direction is only claimed when both windows carry enough volume for the comparison to mean
  // anything. Two documents becoming three is not a 50% improvement.
  let trendDirection: ContinuityReport['trendDirection'] = 'unknown'
  if (recent.length >= MINIMUM_DOCUMENTS_FOR_TREND && previous.length >= MINIMUM_DOCUMENTS_FOR_TREND) {
    if (recent.length > previous.length * 1.1) trendDirection = 'up'
    else if (recent.length < previous.length * 0.9) trendDirection = 'down'
    else trendDirection = 'flat'
  }

  const staleHours = cycleHours * STALE_CYCLES_BEFORE_RED
  if (hoursSinceLastRetention > staleHours) {
    findings.push({
      code: 'retention_stale',
      severity: 'red',
      title: `No new retained learning for ${hoursSinceLastRetention} hours`,
      detail: `The cycle is scheduled every ${cycleHours}h and nothing has been retained for more than ${STALE_CYCLES_BEFORE_RED} cycles. IMPORTANT AMBIGUITY: a cycle that ran and rejected everything as duplicate looks identical to a cycle that never ran, from this table alone. GET /api/admin/cos-learning/run separates them — read accepted vs rejected{reason} vs sourceErrors.`,
    })
  }

  if (recent.length === 0) {
    findings.push({
      code: 'no_recent_retention',
      severity: 'red',
      title: 'Nothing retained in the last 7 days',
      detail: 'The corpus exists but has not grown in a week. Whatever COS answers with today, it learned before this window.',
    })
  } else if (silentDaysLast7 > MAX_SILENT_DAYS_IN_7) {
    findings.push({
      code: 'silent_days',
      severity: 'red',
      title: `${silentDaysLast7} of the last 7 days retained nothing`,
      detail: 'A daily cycle that produces nothing on most days is not running daily, whatever the schedule says. Check the cron invocation and the reasoner pod availability — extraction needs the local model up.',
    })
  }

  if (recent.length > 0 && newSubjects.length === 0) {
    findings.push({
      code: 'no_new_subjects',
      severity: 'amber',
      title: 'No new subjects reached in 7 days',
      detail: 'Every subject retained this week was already in the corpus. That is reinforcement, not expansion — the declared curriculum is not moving into new ground. Cross-check /api/admin/cos-learning/coverage for subjects still never studied.',
    })
  }

  // cos_learning_gaps is only the durable failure/reasoning queue. The daily learning director also
  // creates recurring curriculum, weakness-driven, track-study and corpus-expansion gaps in memory
  // every cycle. Therefore zero pending rows here is not evidence of zero open learning questions.
  // Continuity is judged by actual retention/freshness/subject expansion, while the counts remain
  // in the report as useful queue telemetry.

  if (trendDirection === 'down') {
    findings.push({
      code: 'volume_falling',
      severity: 'amber',
      title: `Retention volume fell (${previous.length} → ${recent.length} documents week over week)`,
      detail: 'Falling volume is not automatically bad — a saturated curriculum rejects repeats. It is only meaningful next to the rejection reasons: duplicate-dominant is healthy saturation, not_relevant or sourceErrors dominant is a real acquisition problem.',
    })
  }

  if (findings.length === 0) {
    findings.push({
      code: 'healthy',
      severity: 'info',
      title: 'Learning is continuous',
      detail: `${recent.length} documents across ${recentSubjects.size} subjects in the last 7 days, ${newSubjects.length} of them new, most recent retention ${hoursSinceLastRetention}h ago.`,
    })
  }

  const status: ContinuityStatus = findings.some(f => f.severity === 'red')
    ? 'red'
    : findings.some(f => f.severity === 'amber')
      ? 'amber'
      : 'green'

  const summary = status === 'red'
    ? `RED — ${findings.filter(f => f.severity === 'red').map(f => f.title).join('; ')}.`
    : status === 'amber'
      ? `AMBER — learning is running but ${findings.filter(f => f.severity === 'amber').map(f => f.title.toLowerCase()).join('; ')}.`
      : `GREEN — ${recent.length} documents retained in 7 days across ${recentSubjects.size} subjects (${newSubjects.length} new), last retention ${hoursSinceLastRetention}h ago.`

  return {
    status,
    generatedAt,
    lastRetentionAt: lastRetention.toISOString(),
    hoursSinceLastRetention,
    corpusDocuments: rows.length,
    documentsLast7Days: recent.length,
    documentsPrevious7Days: previous.length,
    distinctSubjectsLast7Days: recentSubjects.size,
    newSubjectsLast7Days: newSubjects.length,
    newSubjects: newSubjects.slice(0, 40),
    silentDaysLast7,
    dailyRetention,
    sourceKindsLast7Days,
    trendDirection,
    openGaps,
    resolvedGaps,
    totalGaps,
    findings,
    summary,
  }
}
