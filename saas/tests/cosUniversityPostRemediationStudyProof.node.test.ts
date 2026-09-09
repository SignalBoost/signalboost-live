import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { selectCosUniversityPracticeGateDecision } from '../lib/ai/cos/cosUniversityPracticeSelectionPolicy.ts'
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

test('a blocked high-priority restudy decision cannot starve the next eligible practice decision', () => {
  const blockedPhysics = {
    allowed: false,
    reason: 'restudy_required_after_failed_practice',
    planId: 'physics-plan',
  }
  const eligibleEnglish = {
    allowed: true,
    reason: 'accepted_study_proof_verified',
    planId: 'english-writing-plan',
  }

  assert.equal(selectCosUniversityPracticeGateDecision([blockedPhysics]), blockedPhysics)
  assert.equal(
    selectCosUniversityPracticeGateDecision([blockedPhysics, eligibleEnglish]),
    eligibleEnglish,
  )
  assert.equal(selectCosUniversityPracticeGateDecision([]), null)

  const gate = file('lib/ai/cos/cosUniversityPracticeStudyGate.ts')
  assert.match(gate, /\.filter\(row => hasDeliberatePractice\(row\.methods\)\)/)
  assert.match(gate, /\.map\(plan => evaluateCosUniversityPracticeStudyGate\(plan, now\)\)/)
  assert.match(gate, /selectCosUniversityPracticeGateDecision\(decisions\)/)
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
