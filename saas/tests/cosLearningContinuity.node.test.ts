import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assessLearningContinuity,
  MAX_SILENT_DAYS_IN_7,
  MINIMUM_DOCUMENTS_FOR_TREND,
  STALE_CYCLES_BEFORE_RED,
  type RetentionRow,
} from '../lib/ai/cos/learningContinuity.ts'

const now = new Date('2026-08-19T12:00:00.000Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString()

/** n documents on the day `daysAgo`, all on the given subject. */
function docs(count: number, daysAgo: number, subject: string, sourceKind = 'scientific_journal'): RetentionRow[] {
  return Array.from({ length: count }, () => ({
    created_at: new Date(now.getTime() - daysAgo * 86_400_000 - 3_600_000).toISOString(),
    subject,
    source_kind: sourceKind,
  }))
}

test('an empty corpus is no_data, never green', () => {
  const report = assessLearningContinuity([], [], { now })
  assert.equal(report.status, 'no_data')
  assert.equal(report.lastRetentionAt, null)
  // Never 0 — a zero would read as "learned something just now".
  assert.equal(report.hoursSinceLastRetention, null)
  assert.equal(report.findings[0].code, 'empty_corpus')
})

test('retention older than two cycles is red and names the saturated-vs-dead ambiguity', () => {
  const stale: RetentionRow[] = [{ created_at: hoursAgo(24 * STALE_CYCLES_BEFORE_RED + 6), subject: 'rag and evidence quality', source_kind: 'scientific_journal' }]
  const report = assessLearningContinuity(stale, [], { now })
  assert.equal(report.status, 'red')
  const finding = report.findings.find(f => f.code === 'retention_stale')
  assert.ok(finding, 'expected a retention_stale finding')
  assert.match(finding.detail, /cos-learning\/run/)
})

test('more than the allowed silent days in a week is red', () => {
  // Volume is fine; it just all arrived on two days.
  const corpus = [...docs(8, 1, 'multi-agent coordination'), ...docs(8, 2, 'symbolic and bdi reasoning')]
  const report = assessLearningContinuity(corpus, [], { now })
  assert.equal(report.silentDaysLast7 > MAX_SILENT_DAYS_IN_7, true)
  assert.equal(report.status, 'red')
  assert.ok(report.findings.some(f => f.code === 'silent_days'))
})

test('reinforcement without expansion is amber, not green', () => {
  const corpus = [
    ...docs(2, 0, 'secure coding'),
    ...docs(2, 1, 'secure coding'),
    ...docs(2, 2, 'secure coding'),
    ...docs(2, 3, 'secure coding'),
    ...docs(2, 4, 'secure coding'),
    ...docs(2, 5, 'secure coding'),
    ...docs(2, 6, 'secure coding'),
    // Same subject already present before the window, so nothing this week is new.
    ...docs(3, 20, 'secure coding'),
  ]
  const report = assessLearningContinuity(corpus, [], { now })
  assert.equal(report.newSubjectsLast7Days, 0)
  assert.equal(report.status, 'amber')
  assert.ok(report.findings.some(f => f.code === 'no_new_subjects'))
})

test('an all-resolved gap table is flagged as the blanket-resolution fingerprint', () => {
  const corpus = [
    ...docs(2, 0, 'a'), ...docs(2, 1, 'b'), ...docs(2, 2, 'c'), ...docs(2, 3, 'd'),
    ...docs(2, 4, 'e'), ...docs(2, 5, 'f'), ...docs(2, 6, 'g'),
  ]
  const report = assessLearningContinuity(corpus, [{ status: 'resolved', count: 26 }], { now })
  assert.equal(report.openGaps, 0)
  assert.equal(report.resolvedGaps, 26)
  assert.equal(report.status, 'amber')
  assert.ok(report.findings.some(f => f.code === 'no_open_gaps'))
})

test('open gaps in any working status count as open', () => {
  const report = assessLearningContinuity(
    [{ created_at: hoursAgo(2), subject: 'x', source_kind: 'scientific_journal' }],
    [{ status: 'pending', count: 4 }, { status: 'learning', count: 2 }, { status: 'resolved', count: 9 }, { status: 'unstudyable', count: 3 }],
    { now },
  )
  assert.equal(report.openGaps, 6)
  assert.equal(report.totalGaps, 18)
  assert.ok(!report.findings.some(f => f.code === 'no_open_gaps'))
})

test('no trend direction is claimed below the volume threshold in either window', () => {
  const thin = [
    ...docs(1, 0, 'a'), ...docs(1, 1, 'b'), ...docs(1, 2, 'c'),
    ...docs(1, 8, 'd'), ...docs(1, 9, 'e'),
  ]
  const report = assessLearningContinuity(thin, [], { now })
  assert.equal(report.documentsLast7Days < MINIMUM_DOCUMENTS_FOR_TREND, true)
  assert.equal(report.trendDirection, 'unknown')
})

test('a live, expanding cycle is green', () => {
  const corpus = [
    ...docs(3, 0, 'rag and evidence quality'),
    ...docs(3, 1, 'multi-agent coordination'),
    ...docs(3, 2, 'ideal-customer profiling and account research'),
    ...docs(3, 3, 'alarm management'),
    ...docs(3, 4, 'dataset lineage and quality'),
    ...docs(3, 5, 'evaluation and prompt optimization'),
    ...docs(3, 6, 'tenant isolation and retention'),
    ...docs(20, 10, 'older baseline subject'),
  ]
  const report = assessLearningContinuity(corpus, [{ status: 'pending', count: 5 }, { status: 'resolved', count: 20 }], { now })
  assert.equal(report.status, 'green')
  assert.equal(report.silentDaysLast7, 0)
  assert.ok(report.newSubjectsLast7Days >= 7)
  assert.match(report.summary, /^GREEN/)
})

test('the real Aug 12-17 production shape does not pass as green', () => {
  // His own corrected created_at query: 1, 74, 20, 6, 2, 9 documents on Aug 12..17, then silence.
  const corpus = [
    ...docs(1, 7, 'baseline'),
    ...docs(74, 6, 'aug13 subject'),
    ...docs(20, 5, 'aug14 subject'),
    ...docs(6, 4, 'aug15 subject'),
    ...docs(2, 3, 'aug16 subject'),
    ...docs(9, 2, 'aug17 subject'),
  ]
  const report = assessLearningContinuity(corpus, [{ status: 'resolved', count: 26 }], { now })
  assert.notEqual(report.status, 'green')
  assert.ok(report.findings.some(f => f.code === 'retention_stale' || f.code === 'silent_days'))
})
