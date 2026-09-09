import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { selectCosUniversityPracticeStudyGate } from '../lib/ai/cos/cosUniversityPracticeStudyGate.ts'
import { cosUniversityAcceptedStudyClearsRemediationBoundary } from '../lib/ai/cos/cosUniversityStudyProofPolicy.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const file = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const remediationEvidence = {
  practiceRemediation: {
    requestedAt: '2026-09-09T00:10:00.000Z',
    practiceRound: 4,
    requiresNewStudyAttempt: true,
    requiresIndependentRetest: true,
    academicCredit: false,
  },
}

const deliberatePracticeMethods = [{
  id: 'deliberate_practice',
  execution: 'automatic_if_certifiable',
}]

test('accepted study must start strictly after the current same-round remediation boundary', () => {
  assert.equal(cosUniversityAcceptedStudyClearsRemediationBoundary({
    evidence: remediationEvidence,
    currentAttempt: 4,
    acceptedAt: '2026-09-09T00:09:59.999Z',
  }), false)
  assert.equal(cosUniversityAcceptedStudyClearsRemediationBoundary({
    evidence: remediationEvidence,
    currentAttempt: 4,
    acceptedAt: '2026-09-09T00:10:00.000Z',
  }), false)
  assert.equal(cosUniversityAcceptedStudyClearsRemediationBoundary({
    evidence: remediationEvidence,
    currentAttempt: 4,
    acceptedAt: '2026-09-09T00:10:00.001Z',
  }), true)
})

test('a delayed older cycle cannot advance a plan after a newer study attempt already landed', () => {
  const lastAttemptAt = '2026-09-09T00:20:00.000Z'
  assert.equal(cosUniversityAcceptedStudyClearsRemediationBoundary({
    evidence: {},
    currentAttempt: 5,
    lastAttemptAt,
    acceptedAt: '2026-09-09T00:19:59.999Z',
  }), false)
  assert.equal(cosUniversityAcceptedStudyClearsRemediationBoundary({
    evidence: {},
    currentAttempt: 5,
    lastAttemptAt,
    acceptedAt: lastAttemptAt,
  }), false)
  assert.equal(cosUniversityAcceptedStudyClearsRemediationBoundary({
    evidence: {},
    currentAttempt: 5,
    lastAttemptAt,
    acceptedAt: '2026-09-09T00:20:00.001Z',
  }), true)
})

test('a different-round or absent remediation does not block genuinely newer accepted study', () => {
  assert.equal(cosUniversityAcceptedStudyClearsRemediationBoundary({
    evidence: remediationEvidence,
    currentAttempt: 5,
    acceptedAt: '2026-09-09T00:09:00.000Z',
  }), true)
  assert.equal(cosUniversityAcceptedStudyClearsRemediationBoundary({
    evidence: {},
    currentAttempt: 4,
    acceptedAt: '2026-09-09T00:09:00.000Z',
  }), true)
})

test('a blocked high-priority restudy plan cannot starve the next eligible practice plan', () => {
  const blockedPhysics = {
    id: 'physics-plan',
    plan_key: 'physics-plan-key',
    priority: 100,
    status: 'studying',
    attempt_count: 4,
    last_attempt_at: null,
    methods: deliberatePracticeMethods,
    evidence: {
      practiceRemediation: {
        requestedAt: '2026-09-08T21:50:35.246Z',
        practiceRound: 4,
        requiresNewStudyAttempt: true,
        requiresIndependentRetest: true,
        academicCredit: false,
      },
    },
  }
  const eligibleEnglish = {
    id: 'english-writing-plan',
    plan_key: 'english-writing-plan-key',
    priority: 100,
    status: 'studying',
    attempt_count: 3,
    last_attempt_at: '2026-09-09T15:30:12.777Z',
    methods: deliberatePracticeMethods,
    evidence: {
      studyProof: {
        source: 'continuous_learning_accepted_gap',
        observedAt: '2026-09-09T15:30:12.777Z',
        evidenceRefs: ['auto-gap:university-language:english-writing'],
        studyAttempt: 3,
        academicCredit: false,
      },
    },
  }

  const blockedOnly = selectCosUniversityPracticeStudyGate(
    [blockedPhysics],
    new Date('2026-09-09T16:00:00.000Z'),
  )
  assert.equal(blockedOnly.allowed, false)
  assert.equal(blockedOnly.reason, 'restudy_required_after_failed_practice')
  assert.equal(blockedOnly.planId, 'physics-plan')

  const selected = selectCosUniversityPracticeStudyGate(
    [blockedPhysics, eligibleEnglish],
    new Date('2026-09-09T16:00:00.000Z'),
  )
  assert.equal(selected.allowed, true)
  assert.equal(selected.reason, 'accepted_study_proof_verified')
  assert.equal(selected.planId, 'english-writing-plan')
  assert.equal(selected.studyAttempt, 3)
})

test('all University learning writers bind proof to cycle start rather than writer completion time', () => {
  const undergraduate = file('lib/ai/cos/cosUniversityContinuousLearning.ts')
  const masters = file('lib/ai/cos/cosUniversityMastersLearningRunner.ts')
  const daily = file('app/api/cron/cos-mining/route.ts')
  const proof = file('lib/ai/cos/cosUniversityStudyProof.ts')
  const policy = file('lib/ai/cos/cosUniversityStudyProofPolicy.ts')

  assert.match(undergraduate, /universityStudyProofsFromAcceptedLearning\([\s\S]*result\.acceptedGapIds, now\.toISOString\(\)\)/)
  assert.match(undergraduate, /return refs\.length \? \[\{ planId: plan\.id, evidenceRefs: refs, acceptedAt \}\] : \[\]/)

  assert.match(masters, /const acceptedAt = now\.toISOString\(\)/)
  assert.match(masters, /evidenceRefs: \[\.\.\.new Set\(evidenceRefs\)\],[\s\S]*acceptedAt/)

  const captureAt = daily.indexOf('dailyLearningStartedAt = new Date().toISOString()')
  const runAt = daily.indexOf('learning = await runDailyAutonomousLearning')
  assert.ok(captureAt >= 0)
  assert.ok(runAt > captureAt)
  assert.match(daily, /const acceptedAt = dailyLearningStartedAt \|\| dailyStartedAt/)
  assert.match(daily, /\{ planId: plan\.id, evidenceRefs, acceptedAt \}/)

  assert.match(policy, /timestampMs <= lastAttemptMs/)
  assert.match(policy, /timestampMs > boundaryMs/)
  assert.match(proof, /lastAttemptAt: row\.last_attempt_at/)
  assert.match(proof, /cosUniversityAcceptedStudyClearsRemediationBoundary/)
  assert.match(proof, /const proofObservedAt = accepted\[accepted\.length - 1\]\.acceptedAt/)
  assert.match(proof, /updated_at: writerNowIso/)
  assert.doesNotMatch(proof, /observedAt: writerNowIso/)
  assert.doesNotMatch(proof, /last_attempt_at: writerNowIso/)
})
