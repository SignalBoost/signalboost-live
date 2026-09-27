import test from 'node:test'
import assert from 'node:assert/strict'
import { builderCompetencyGapCandidate } from '../lib/builder/competency-gap.ts'

test('verified coding failure becomes focused portable University input', () => {
  const gap = builderCompetencyGapCandidate({
    jobId: 'job-1',
    objective: 'Fix the TypeScript repository build and verify the tests',
    error: 'builder_verification_failed',
    ownerAuthorized: true,
  })
  assert.equal(gap?.subject, 'software engineering')
  assert.equal(gap?.capability, 'builder_autonomous_completion')
  assert.match(gap?.escalationReason || '', /^verified_builder_failure:/)
  assert.doesNotMatch(gap?.question || '', /stdout|stderr|trace/i)
})

test('operational and authority failures do not become training curriculum', () => {
  for (const error of ['builder_runpod_primary_busy','builder_turn_timeout','approval_required','budget_exhausted','rate_limit']) {
    assert.equal(builderCompetencyGapCandidate({
      jobId: 'job-2', objective: 'Fix the build', error, ownerAuthorized: true,
    }), null)
  }
})

test('unowned Builder failures cannot mint University work', () => {
  assert.equal(builderCompetencyGapCandidate({
    jobId: 'job-3', objective: 'Fix the build', error: 'builder_verification_failed', ownerAuthorized: false,
  }), null)
})
