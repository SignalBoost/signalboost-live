import test from 'node:test'
import assert from 'node:assert/strict'
import { builderCompetencyGapCandidate, classifyBuilderCompetencyFailure } from '../lib/builder/competency-gap.ts'
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


test('runtime-emitted Builder failures map only to stable capability classes', () => {
  assert.equal(classifyBuilderCompetencyFailure('builder_model_control_schema_mismatch'), 'builder_model_control_failed')
  assert.equal(classifyBuilderCompetencyFailure('builder_verification_order_required'), 'builder_verification_failed')
  assert.equal(classifyBuilderCompetencyFailure('builder_regression_not_reproduced'), 'builder_verification_failed')
  assert.equal(classifyBuilderCompetencyFailure('builder_stalled_repeated_inspection'), 'builder_tool_selection_failed')
  assert.equal(classifyBuilderCompetencyFailure('builder_repeated_tool_call:run; choose a different next step'), 'builder_tool_selection_failed')
  assert.equal(classifyBuilderCompetencyFailure('builder_repair_progress_required'), 'builder_repair_attempts_exhausted')
  assert.equal(classifyBuilderCompetencyFailure('builder_task_incomplete'), 'builder_repair_attempts_exhausted')
})

test('operational and authority failures never become competency training', () => {
  for (const error of [
    'builder_runpod_primary_busy',
    'builder_turn_timeout',
    'builder_time_budget_reached',
    'builder_job_storage_unavailable',
    'builder_run_budget_exhausted',
    'builder_write_budget_exhausted',
    'builder_round_budget_exhausted',
    'builder_checkpoint_scope_mismatch',
    'builder_documentation_scope_invalid',
    'builder_repository_repair_owner_required',
    'approval_required',
    'budget_exhausted',
    'rate_limit',
    'some_unknown_exception',
  ]) assert.equal(classifyBuilderCompetencyFailure(error), null, error)
})

test('candidate stores the stable class, never the raw emitted failure detail', () => {
  const gap = builderCompetencyGapCandidate({
    jobId: 'job-runtime',
    objective: 'Repair and verify the TypeScript implementation',
    error: 'builder_model_control_malformed_json',
    ownerAuthorized: true,
  })
  assert.equal(gap?.capability, 'builder_autonomous_completion:builder_model_control_failed')
  assert.equal(gap?.escalationReason, 'verified_builder_failure:builder_model_control_failed')
  assert.doesNotMatch(JSON.stringify(gap), /malformed_json/)
})


test('missed competency reconciliation is bounded, owner-only, terminal-only, and reuses the classifier', () => {
  const source = readFileSync(new URL('../lib/builder/competency-gap.ts', import.meta.url), 'utf8')
  assert.match(source, /export async function reconcileBuilderCompetencyGaps/)
  assert.match(source, /\.eq\('status', 'failed'\)/)
  assert.match(source, /\.eq\('owner_authorized', true\)/)
  assert.match(source, /Math\.min\(168/)
  assert.match(source, /Math\.min\(100/)
  assert.match(source, /classifyBuilderCompetencyFailure\(row\.error\)/)
  assert.match(source, /recordBuilderCompetencyGap\(\{/)
})

test('continuation cron self-heals missed Builder competency gaps without accepting request work', () => {
  const source = readFileSync(new URL('../app/api/cron/builder-continuations/route.ts', import.meta.url), 'utf8')
  assert.match(source, /reconcileBuilderCompetencyGaps\(\{ lookbackHours: 72, limit: 50 \}\)/)
  assert.match(source, /competencyGapsFiled/)
})
