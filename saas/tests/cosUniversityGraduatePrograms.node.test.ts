import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildCosUniversityProgramEnrollment } from '../lib/ai/cos/cosUniversityPrograms.ts'
import type { CosUniversityCredential } from '../lib/ai/cos/cosUniversityCredentials.ts'
import type { CosUniversityTranscriptEntry } from '../lib/ai/cos/cosUniversity.ts'
import type { SpecialistCompetencySnapshot } from '../lib/ai/cos/specialistLearning.ts'
import {
  COS_UNIVERSITY_SOFTWARE_MASTERS_CAPSTONE_KEY,
  COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM,
  COS_UNIVERSITY_SOFTWARE_MASTERS_MINIMUM_CAPSTONE_PASSES,
  COS_UNIVERSITY_SOFTWARE_MASTERS_PROGRAM_KEY,
  COS_UNIVERSITY_SOFTWARE_MASTERS_REQUIRED_UNDERGRAD_SUBJECTS,
  deriveSoftwareMastersCompetencyStanding,
  deriveSoftwareMastersGraduationStatus,
  evaluateSoftwareMastersAdmission,
  softwareMastersCapstonePassesSinceLatestFailure,
  type CosUniversityGraduateAssessmentEvidence,
} from '../lib/ai/cos/cosUniversityGraduatePrograms.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const undergraduateCredential: CosUniversityCredential = {
  credentialKey: 'cos_generalist_undergraduate_v1',
  programKey: 'generalist_undergraduate_v1',
  programLevel: 'undergraduate',
  title: 'COS University Generalist Undergraduate Credential',
  standing: 'A',
  awardedAt: '2026-11-20T00:00:00.000Z',
}

function transcript(overrides: Partial<Record<string, CosUniversityTranscriptEntry['grade']>> = {}): CosUniversityTranscriptEntry[] {
  return COS_UNIVERSITY_SOFTWARE_MASTERS_REQUIRED_UNDERGRAD_SUBJECTS.map(subjectId => ({
    subjectId,
    title: subjectId,
    grade: overrides[subjectId] ?? 'A',
    evidenceCount: 8,
    latestAssessmentAt: '2026-11-19T00:00:00.000Z',
    reasons: ['fresh fixture evidence'],
  }))
}

function specialist(freshValidatedSkills = 1): SpecialistCompetencySnapshot {
  return {
    specialistFamily: 'software',
    totalSkills: Math.max(1, freshValidatedSkills),
    lifecycleCounts: {
      encountered: 0,
      evaluated: 0,
      understood: 0,
      practiced: 0,
      validated: freshValidatedSkills,
      learned: 0,
      mastered: 0,
      weakened: 0,
      quarantined: 0,
    },
    curriculumCounts: {},
    freshValidatedSkills,
    staleValidatedSkills: 0,
  }
}

function evidence(args: {
  competencyKey: string
  stage: CosUniversityGraduateAssessmentEvidence['stage']
  passed?: boolean
  at: string
  variant?: string
  authority?: CosUniversityGraduateAssessmentEvidence['scorerAuthority']
  validUntil?: string
}): CosUniversityGraduateAssessmentEvidence {
  const authority = args.authority ?? (
    args.stage === 'production_transfer'
      ? 'verified_production'
      : args.stage === 'capstone'
        ? 'host_capstone'
        : 'host_private_exam'
  )
  return {
    assessmentKey: `${args.competencyKey}:${args.stage}:${args.at}:${args.variant || 'v'}`,
    programKey: COS_UNIVERSITY_SOFTWARE_MASTERS_PROGRAM_KEY,
    programLevel: 'masters',
    specialistFamily: 'software',
    competencyKey: args.competencyKey,
    stage: args.stage,
    passed: args.passed ?? true,
    independentScorer: true,
    scorerVersion: 'software-masters-host-v1',
    scorerAuthority: authority,
    variantHash: args.variant ?? `${args.competencyKey}:${args.stage}:${args.at}`,
    observedAt: args.at,
    validUntil: args.validUntil ?? '2027-12-31T00:00:00.000Z',
  }
}

function minimumGraduationEvidence(): CosUniversityGraduateAssessmentEvidence[] {
  const rows: CosUniversityGraduateAssessmentEvidence[] = []
  let day = 1
  for (const competency of COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM) {
    const prefix = String(day).padStart(2, '0')
    rows.push(evidence({ competencyKey: competency.key, stage: 'qualifying_exam', at: `2026-10-${prefix}T00:00:00.000Z` }))
    rows.push(evidence({ competencyKey: competency.key, stage: 'applied_transfer', at: `2026-10-${prefix}T01:00:00.000Z` }))
    rows.push(evidence({ competencyKey: competency.key, stage: 'production_transfer', at: `2026-10-${prefix}T02:00:00.000Z` }))
    day += 1
  }
  rows.push(evidence({ competencyKey: COS_UNIVERSITY_SOFTWARE_MASTERS_CAPSTONE_KEY, stage: 'capstone', at: '2026-10-20T00:00:00.000Z', variant: 'capstone-a' }))
  rows.push(evidence({ competencyKey: COS_UNIVERSITY_SOFTWARE_MASTERS_CAPSTONE_KEY, stage: 'capstone', at: '2026-10-21T00:00:00.000Z', variant: 'capstone-b' }))
  return rows
}

test('Software Engineering Master’s is a seven-domain graduate curriculum mapped onto the existing Software Specialist tracks', () => {
  assert.equal(COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM.length, 7)
  assert.deepEqual(
    COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM.map(row => row.key),
    ['software.development','software.debugging','software.testing','software.architecture','software.delivery','software.security','software.technical-writing'],
  )
  assert.equal(new Set(COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM.map(row => row.curriculumTrack)).size, 7)
})

test('Master’s admission requires the awarded generalist degree, current A-range prerequisites, and real fresh specialist evidence', () => {
  const admitted = evaluateSoftwareMastersAdmission({
    credentials: [undergraduateCredential],
    subjectTranscript: transcript(),
    specialistSnapshot: specialist(1),
  })
  assert.equal(admitted.admitted, true)
  assert.equal(admitted.authorityExpanded, false)

  const noDegree = evaluateSoftwareMastersAdmission({ credentials: [], subjectTranscript: transcript(), specialistSnapshot: specialist(1) })
  assert.equal(noDegree.admitted, false)
  assert.ok(noDegree.blockers.includes('generalist_undergraduate_credential_required'))

  const staleMath = evaluateSoftwareMastersAdmission({
    credentials: [undergraduateCredential],
    subjectTranscript: transcript({ mathematics: 'A-' }),
    specialistSnapshot: specialist(1),
  })
  assert.equal(staleMath.admitted, false)
  assert.ok(staleMath.blockers.includes('current_undergraduate_mathematics_A_required'))

  const noValidatedSpecialistEvidence = evaluateSoftwareMastersAdmission({
    credentials: [undergraduateCredential],
    subjectTranscript: transcript(),
    specialistSnapshot: specialist(0),
  })
  assert.equal(noValidatedSpecialistEvidence.admitted, false)
  assert.ok(noValidatedSpecialistEvidence.blockers.includes('fresh_validated_software_specialist_evidence_required'))
})

test('specialist lifecycle status alone cannot manufacture graduate standing', () => {
  const competency = COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM[0]
  const standing = deriveSoftwareMastersCompetencyStanding(competency, [], new Date('2026-11-01T00:00:00.000Z'))
  assert.equal(standing.grade, 'unassessed')
  assert.equal(standing.evidenceCount, 0)
})

test('graduate competency advances only through fresh independent exam, transfer, Production, and distinction evidence', () => {
  const competency = COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM[0]
  const rows = [
    evidence({ competencyKey: competency.key, stage: 'qualifying_exam', at: '2026-10-01T00:00:00.000Z' }),
    evidence({ competencyKey: competency.key, stage: 'applied_transfer', at: '2026-10-02T00:00:00.000Z' }),
    evidence({ competencyKey: competency.key, stage: 'production_transfer', at: '2026-10-03T00:00:00.000Z' }),
  ]
  assert.equal(deriveSoftwareMastersCompetencyStanding(competency, rows, new Date('2026-11-01T00:00:00.000Z')).grade, 'A')
  rows.push(evidence({ competencyKey: competency.key, stage: 'distinction', at: '2026-10-04T00:00:00.000Z' }))
  assert.equal(deriveSoftwareMastersCompetencyStanding(competency, rows, new Date('2026-11-01T00:00:00.000Z')).grade, 'A+')
})

test('a later failed required graduate stage revokes that stage until a newer independent pass exists', () => {
  const competency = COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM[0]
  const rows = [
    evidence({ competencyKey: competency.key, stage: 'qualifying_exam', at: '2026-10-01T00:00:00.000Z' }),
    evidence({ competencyKey: competency.key, stage: 'applied_transfer', at: '2026-10-02T00:00:00.000Z' }),
    evidence({ competencyKey: competency.key, stage: 'production_transfer', at: '2026-10-03T00:00:00.000Z' }),
    evidence({ competencyKey: competency.key, stage: 'production_transfer', passed: false, at: '2026-10-04T00:00:00.000Z' }),
  ]
  assert.equal(deriveSoftwareMastersCompetencyStanding(competency, rows, new Date('2026-11-01T00:00:00.000Z')).grade, 'A-')
  rows.push(evidence({ competencyKey: competency.key, stage: 'production_transfer', at: '2026-10-05T00:00:00.000Z' }))
  assert.equal(deriveSoftwareMastersCompetencyStanding(competency, rows, new Date('2026-11-01T00:00:00.000Z')).grade, 'A')
})

test('stale, self-scored, or wrong-authority evidence cannot earn graduate credit', () => {
  const competency = COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM[0]
  const stale = { ...evidence({ competencyKey: competency.key, stage: 'qualifying_exam', at: '2026-01-01T00:00:00.000Z', validUntil: '2026-02-01T00:00:00.000Z' }) }
  const selfScored = { ...evidence({ competencyKey: competency.key, stage: 'qualifying_exam', at: '2026-10-01T00:00:00.000Z' }), independentScorer: false }
  const wrongAuthority = evidence({ competencyKey: competency.key, stage: 'production_transfer', at: '2026-10-03T00:00:00.000Z', authority: 'host_private_exam' })
  const standing = deriveSoftwareMastersCompetencyStanding(competency, [stale, selfScored, wrongAuthority], new Date('2026-11-01T00:00:00.000Z'))
  assert.equal(standing.grade, 'unassessed')
})

test('Master’s capstone requires two materially distinct fresh passes after the latest failure', () => {
  assert.equal(COS_UNIVERSITY_SOFTWARE_MASTERS_MINIMUM_CAPSTONE_PASSES, 2)
  const rows = [
    evidence({ competencyKey: COS_UNIVERSITY_SOFTWARE_MASTERS_CAPSTONE_KEY, stage: 'capstone', at: '2026-10-20T00:00:00.000Z', variant: 'same' }),
    evidence({ competencyKey: COS_UNIVERSITY_SOFTWARE_MASTERS_CAPSTONE_KEY, stage: 'capstone', at: '2026-10-21T00:00:00.000Z', variant: 'same' }),
  ]
  assert.equal(softwareMastersCapstonePassesSinceLatestFailure(rows, new Date('2026-11-01T00:00:00.000Z')), 1)
  rows.push(evidence({ competencyKey: COS_UNIVERSITY_SOFTWARE_MASTERS_CAPSTONE_KEY, stage: 'capstone', at: '2026-10-22T00:00:00.000Z', variant: 'different' }))
  assert.equal(softwareMastersCapstonePassesSinceLatestFailure(rows, new Date('2026-11-01T00:00:00.000Z')), 2)
  rows.push(evidence({ competencyKey: COS_UNIVERSITY_SOFTWARE_MASTERS_CAPSTONE_KEY, stage: 'capstone', passed: false, at: '2026-10-23T00:00:00.000Z', variant: 'failure' }))
  assert.equal(softwareMastersCapstonePassesSinceLatestFailure(rows, new Date('2026-11-01T00:00:00.000Z')), 0)
})

test('Master’s graduation requires active program time, A-range depth in every competency, and the global capstone', () => {
  const enrollment = buildCosUniversityProgramEnrollment({
    programKey: COS_UNIVERSITY_SOFTWARE_MASTERS_PROGRAM_KEY,
    level: 'masters',
    enrolledAt: new Date('2026-09-08T00:00:00.000Z'),
  })
  const ready = deriveSoftwareMastersGraduationStatus({
    enrollment,
    evidence: minimumGraduationEvidence(),
    now: new Date('2026-11-01T00:00:00.000Z'),
  })
  assert.equal(ready.minimumResidenceSatisfied, true)
  assert.equal(ready.competencyBlockers.length, 0)
  assert.equal(ready.capstonePassed, true)
  assert.equal(ready.graduationReady, true)
  assert.equal(ready.standing, 'A')
  assert.equal(ready.authorityExpanded, false)

  const tooEarly = deriveSoftwareMastersGraduationStatus({ enrollment, evidence: minimumGraduationEvidence(), now: new Date('2026-09-20T00:00:00.000Z') })
  assert.equal(tooEarly.graduationReady, false)

  const expired = deriveSoftwareMastersGraduationStatus({ enrollment, evidence: minimumGraduationEvidence(), now: new Date('2027-04-01T00:00:00.000Z') })
  assert.equal(expired.deadlineExpired, true)
  assert.equal(expired.graduationReady, false)
})

test('A+ Master’s standing requires distinction evidence across every graduate competency', () => {
  const enrollment = buildCosUniversityProgramEnrollment({
    programKey: COS_UNIVERSITY_SOFTWARE_MASTERS_PROGRAM_KEY,
    level: 'masters',
    enrolledAt: new Date('2026-09-08T00:00:00.000Z'),
  })
  const rows = minimumGraduationEvidence()
  let hour = 0
  for (const competency of COS_UNIVERSITY_SOFTWARE_MASTERS_CURRICULUM) {
    rows.push(evidence({ competencyKey: competency.key, stage: 'distinction', at: `2026-10-25T${String(hour).padStart(2, '0')}:00:00.000Z` }))
    hour += 1
  }
  const status = deriveSoftwareMastersGraduationStatus({ enrollment, evidence: rows, now: new Date('2026-11-01T00:00:00.000Z') })
  assert.equal(status.graduationReady, true)
  assert.equal(status.standing, 'A+')
})

test('graduate assessment ledger is generic, service-only, and stores evidence instead of caller-supplied grades or hidden exams', () => {
  const schema = file('supabase/migrations/20260908163500_cos_university_program_assessments.sql')
  assert.match(schema, /program_level in \('masters','phd','professional_certificate'\)/i)
  assert.match(schema, /competency_key text not null/i)
  assert.match(schema, /assessment_stage text not null/i)
  assert.match(schema, /production_transfer.*verified_production/is)
  assert.match(schema, /capstone.*host_capstone/is)
  assert.match(schema, /enable row level security/i)
  assert.match(schema, /revoke all on table public\.cos_university_program_assessments from anon, authenticated/i)
  assert.doesNotMatch(schema, /\bgrade\s+text\b/i)
  assert.doesNotMatch(schema, /\bprompt\s+text\b/i)
  assert.doesNotMatch(schema, /\brubric\s+jsonb\b/i)
  assert.doesNotMatch(schema, /\breply\s+text\b/i)
})
