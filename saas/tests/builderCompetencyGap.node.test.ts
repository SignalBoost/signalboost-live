import test from 'node:test'
import assert from 'node:assert/strict'
import { builderCompetencyGapCandidate } from '../lib/builder/competency-gap.ts'
import { readFileSync } from 'node:fs'

test('verified coding failure becomes focused portable University input', () => {
  const gap = builderCompetencyGapCandidate({
    jobId: 'job-1',
    objective: 'Fix the TypeScript repository build and verify the tests',
    error: 'builder_verification_failed',
    ownerAuthorized: true,
  })
  assert.equal(gap?.subject, 'software engineering')
  assert.equal(gap?.capability, 'builder_autonomous_completion:builder_verification_failed')
  assert.match(gap?.escalationReason || '', /^verified_builder_failure:/)
  assert.doesNotMatch(gap?.question || '', /Fix the TypeScript|stdout|stderr|trace/i)
})

test('operational and authority failures do not become training curriculum', () => {
  for (const error of ['builder_runpod_primary_busy','builder_turn_timeout','builder_job_storage_unavailable','approval_required','budget_exhausted','rate_limit','some_unknown_exception']) {
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


test('learning query is stable class-level curriculum and contains no raw owner objective', () => {
  const secretObjective = 'Fix customer ACME token=super-secret-value in private/repo/path and deploy it'
  const first = builderCompetencyGapCandidate({
    jobId: 'job-a', objective: secretObjective, error: 'builder_verification_failed', ownerAuthorized: true,
  })
  const second = builderCompetencyGapCandidate({
    jobId: 'job-b', objective: 'Fix another TypeScript build', error: 'builder_verification_failed', ownerAuthorized: true,
  })
  assert.equal(first?.question, second?.question)
  assert.equal(first?.capability, second?.capability)
  assert.doesNotMatch(first?.question || '', /ACME|super-secret|private\/repo|customer/i)
})

test('ordinary terminal Builder result path records competency gaps', () => {
  const runner = readFileSync(new URL('../lib/builder/job-runner.ts', import.meta.url), 'utf8')
  const ordinaryFailure = runner.slice(runner.indexOf('if (result.ok === false)'), runner.indexOf('if (verifiedBuilderCognitiveApplication(result))'))
  assert.match(ordinaryFailure, /recordBuilderCompetencyGap/)
  assert.match(ordinaryFailure, /terminalError/)
})
