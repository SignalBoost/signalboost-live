import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeCurriculumCoverage,
  MINIMUM_DOCUMENTS_FOR_LEARNED,
  MAXIMUM_EVIDENCE_AGE_DAYS,
} from '../lib/ai/cos/curriculumCoverage.ts'

const now = new Date('2026-08-17T00:00:00.000Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

test('a declared subject with no corpus rows is reported as never studied', () => {
  const report = computeCurriculumCoverage(
    [{ subject: 'secure coding', declaredIn: 'curriculum_track:cyber_defense' }],
    [],
    { now },
  )
  assert.equal(report.declaredSubjects, 1)
  assert.equal(report.neverStudied, 1)
  assert.equal(report.coverageRate, 0)
  assert.equal(report.neverStudiedSubjects[0].subject, 'secure coding')
  assert.deepEqual(report.neverStudiedSubjects[0].declaredIn, ['curriculum_track:cyber_defense'])
})

test('one document is thin, not learned', () => {
  const report = computeCurriculumCoverage(
    [{ subject: 'SRE and observability', declaredIn: 'recurring_technology_curriculum' }],
    [{ subject: 'SRE and observability', source_kind: 'scientific_journal', observed_at: daysAgo(1) }],
    { now },
  )
  assert.equal(report.subjects[0].status, 'thin')
  assert.equal(report.thin, 1)
  assert.equal(report.learned, 0)
})

test('enough recent documents count as learned, and old ones go stale', () => {
  const fresh = Array.from({ length: MINIMUM_DOCUMENTS_FOR_LEARNED }, () => ({
    subject: 'Database and data-layer performance',
    source_kind: 'scientific_journal',
    observed_at: daysAgo(2),
  }))
  const old = Array.from({ length: MINIMUM_DOCUMENTS_FOR_LEARNED }, () => ({
    subject: 'Enterprise cybersecurity',
    source_kind: 'video_transcript',
    observed_at: daysAgo(MAXIMUM_EVIDENCE_AGE_DAYS + 10),
  }))
  const report = computeCurriculumCoverage(
    [
      { subject: 'Database and data-layer performance', declaredIn: 'recurring_technology_curriculum' },
      { subject: 'Enterprise cybersecurity', declaredIn: 'recurring_technology_curriculum' },
    ],
    [...fresh, ...old],
    { now },
  )
  const byName = Object.fromEntries(report.subjects.map(subject => [subject.subject, subject]))
  assert.equal(byName['Database and data-layer performance'].status, 'learned')
  assert.equal(byName['Database and data-layer performance'].sourceKinds.join(','), 'scientific_journal')
  assert.equal(byName['Enterprise cybersecurity'].status, 'stale')
  assert.equal(report.coverageRate, 0.5)
})

test('matching ignores case and padding, and one subject declared twice is not double counted', () => {
  const report = computeCurriculumCoverage(
    [
      { subject: 'sensor fusion', declaredIn: 'curriculum_track:robotics_edge_ai' },
      { subject: '  Sensor Fusion  ', declaredIn: 'robotics_physics_curriculum' },
    ],
    [{ subject: 'Sensor fusion', source_kind: 'official_documentation', observed_at: daysAgo(3) }],
    { now },
  )
  assert.equal(report.declaredSubjects, 1)
  assert.deepEqual(report.subjects[0].declaredIn, ['curriculum_track:robotics_edge_ai', 'robotics_physics_curriculum'])
  assert.equal(report.subjects[0].documents, 1)
  assert.equal(report.undeclaredCorpusSubjects.length, 0)
})

// The corpus fragments observed in production on 2026-08-17 belonged to no declared subject.
test('corpus subjects nothing declares are surfaced as drift', () => {
  const report = computeCurriculumCoverage(
    [{ subject: 'SRE and observability', declaredIn: 'recurring_technology_curriculum' }],
    [
      { subject: 'worse president times', source_kind: 'scientific_journal', observed_at: daysAgo(2) },
      { subject: 'worse president times', source_kind: 'scientific_journal', observed_at: daysAgo(2) },
      { subject: 'show components relationships', source_kind: 'scientific_journal', observed_at: daysAgo(1) },
    ],
    { now },
  )
  assert.equal(report.undeclaredCorpusSubjects.length, 2)
  assert.equal(report.undeclaredCorpusSubjects[0].subject, 'worse president times')
  assert.equal(report.undeclaredCorpusSubjects[0].documents, 2)
  assert.equal(report.neverStudied, 1)
})

test('missing or unparseable timestamps never fake freshness', () => {
  const rows = Array.from({ length: MINIMUM_DOCUMENTS_FOR_LEARNED }, () => ({
    subject: 'cloud architecture containers Kubernetes serverless reliability',
    source_kind: 'scientific_journal',
    observed_at: 'not a date',
  }))
  const report = computeCurriculumCoverage(
    [{ subject: 'cloud architecture containers Kubernetes serverless reliability', declaredIn: 'foundational_domain' }],
    rows,
    { now },
  )
  assert.equal(report.subjects[0].lastObservedAt, null)
  assert.equal(report.subjects[0].ageDays, null)
  assert.equal(report.subjects[0].documents, MINIMUM_DOCUMENTS_FOR_LEARNED)
})
