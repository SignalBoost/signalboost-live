import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  COS_UNIVERSITY_ONE_TIME_TEACHER_DISPATCH_PROFILE,
  ONE_TIME_TEACHER_MAX_ESTIMATED_COST_USD,
  ONE_TIME_TEACHER_MAX_HOURLY_COST_USD,
  oneTimeTeacherApprovalEventKey,
  validateOneTimeTeacherApprovalEvidence,
} from '../lib/ai/cos/cosUniversityOneTimeTeacherDispatch.ts'

const candidateId = 'study-plan:7bb8ce24-e3b3-488a-9cd1-29a3898c5862'
const now = new Date('2026-09-13T21:50:00.000Z')

function approval(extra: Record<string, unknown> = {}) {
  return {
    profile: COS_UNIVERSITY_ONE_TIME_TEACHER_DISPATCH_PROFILE,
    claim: 'teacher_dataset_one_time_approval',
    operation: 'generate_teacher_dataset',
    candidateId,
    status: 'pending',
    authorizedAt: '2026-09-13T21:49:00.000Z',
    expiresAt: '2026-09-13T21:59:00.000Z',
    maxHourlyCostUsd: 1,
    maxEstimatedCostUsd: 0.20,
    studentTrainingAuthorized: false,
    authorityExpanded: false,
    ...extra,
  }
}

test('valid one-time receipt is exact, short-lived and teacher-only', () => {
  const result = validateOneTimeTeacherApprovalEvidence(approval(), now)
  assert.equal(result.eligible, true)
  assert.equal(result.candidateId, candidateId)
  assert.equal(result.maxHourlyCostUsd, 1)
  assert.equal(result.maxEstimatedCostUsd, 0.20)
})

test('student training can never be authorized by the one-time teacher receipt', () => {
  const wrongOperation = validateOneTimeTeacherApprovalEvidence(approval({ operation: 'train' }), now)
  assert.equal(wrongOperation.eligible, false)
  assert.ok(wrongOperation.blockers.includes('one_time_teacher_approval_operation_invalid'))

  const studentTraining = validateOneTimeTeacherApprovalEvidence(approval({ studentTrainingAuthorized: true }), now)
  assert.equal(studentTraining.eligible, false)
  assert.ok(studentTraining.blockers.includes('one_time_teacher_student_training_forbidden'))
})

test('hard cost ceilings cannot be raised by an approval row', () => {
  assert.equal(ONE_TIME_TEACHER_MAX_HOURLY_COST_USD, 1)
  assert.equal(ONE_TIME_TEACHER_MAX_ESTIMATED_COST_USD, 0.20)
  assert.equal(validateOneTimeTeacherApprovalEvidence(approval({ maxHourlyCostUsd: 1.01 }), now).eligible, false)
  assert.equal(validateOneTimeTeacherApprovalEvidence(approval({ maxEstimatedCostUsd: 0.201 }), now).eligible, false)
})

test('approval expires and cannot use a validity window longer than 15 minutes', () => {
  const expired = validateOneTimeTeacherApprovalEvidence(approval({ expiresAt: '2026-09-13T21:49:59.000Z' }), now)
  assert.equal(expired.eligible, false)
  assert.ok(expired.blockers.includes('one_time_teacher_approval_expired'))

  const tooLong = validateOneTimeTeacherApprovalEvidence(approval({
    authorizedAt: '2026-09-13T21:40:00.000Z',
    expiresAt: '2026-09-13T21:56:00.001Z',
  }), now)
  assert.equal(tooLong.eligible, false)
  assert.ok(tooLong.blockers.includes('one_time_teacher_approval_window_invalid'))
})

test('raw bearer token is represented only by its SHA-256 event key', () => {
  const token = 'owner-approved-one-time-token-1234567890abcdef'
  const key = oneTimeTeacherApprovalEventKey(token)
  assert.match(key, /^[a-f0-9]{64}$/)
  assert.notEqual(key, token)
  assert.doesNotMatch(key, /owner-approved/)
})

test('single-use route has no owner-session fallback and never enables persistent dispatch', () => {
  const route = readFileSync('app/api/internal/cos/university-distillation-teacher/dispatch-once/route.ts', 'utf8')
  const approvalModule = readFileSync('lib/ai/cos/cosUniversityOneTimeTeacherDispatch.ts', 'utf8')
  const jobModule = readFileSync('lib/ai/cos/cosUniversityOneTimeTeacherJob.ts', 'utf8')
  assert.match(route, /claimOneTimeTeacherDispatchApproval/)
  assert.match(route, /finishOneTimeTeacherDispatchApproval/)
  assert.match(route, /studentTrainingAuthorized:\s*false/)
  assert.doesNotMatch(route, /confirmDispatch:\s*true/)
  assert.doesNotMatch(approvalModule, /COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED\s*=/)
  assert.doesNotMatch(jobModule, /COS_UNIVERSITY_TRAINING_EXECUTOR_DISPATCH_ENABLED\s*=/)
  assert.match(jobModule, /submitHuggingFaceJob/)
  assert.match(jobModule, /Math\.floor\(approval\.maxEstimatedCostUsd \* 3600 \/ hardware\.hourlyCostUsd\)/)
  assert.match(jobModule, /buildHuggingFaceJobSpec/)
})

test('single-use claim uses fenced RPCs and never mutates the append-only assurance ledger', () => {
  const approvalModule = readFileSync('lib/ai/cos/cosUniversityOneTimeTeacherDispatch.ts', 'utf8')
  assert.match(approvalModule, /\.rpc\('claim_cos_university_one_time_teacher_dispatch'/)
  assert.match(approvalModule, /\.rpc\('finish_cos_university_one_time_teacher_dispatch'/)
  assert.doesNotMatch(approvalModule, /from\('cos_university_learning_assurance_events'\)[\s\S]{0,500}\.update\(/)
})

test('migration isolates mutable capability state and appends immutable audit receipts', () => {
  const migration = readFileSync('supabase/migrations/20260913221500_cos_university_one_time_teacher_dispatch.sql', 'utf8')
  assert.match(migration, /cos_university_one_time_teacher_dispatch_approvals/)
  assert.match(migration, /claim_cos_university_one_time_teacher_dispatch/)
  assert.match(migration, /finish_cos_university_one_time_teacher_dispatch/)
  assert.match(migration, /revoke all on public\.cos_university_one_time_teacher_dispatch_approvals from public, anon, authenticated, service_role/)
  assert.match(migration, /insert into public\.cos_university_learning_assurance_events/)
  assert.match(migration, /student_training_authorized = false/)
  assert.match(migration, /max_hourly_cost_usd <= 1\.000000/)
  assert.match(migration, /max_estimated_cost_usd <= 0\.200000/)
  assert.match(migration, /subject_id text not null check \(subject_id = 'reasoning_decision_science'\)/)
})

test('provider acceptance is never downgraded to a replayable failed receipt by later audit failure', () => {
  const route = readFileSync('app/api/internal/cos/university-distillation-teacher/dispatch-once/route.ts', 'utf8')
  const jobModule = readFileSync('lib/ai/cos/cosUniversityOneTimeTeacherJob.ts', 'utf8')
  assert.match(jobModule, /OneTimeTeacherProviderAcceptedAuditError/)
  assert.match(jobModule, /submitHuggingFaceJob[\s\S]*teacher_dataset_job_dispatched/)
  assert.match(route, /isOneTimeTeacherProviderAcceptedAuditError/)
  assert.match(route, /status:\s*'dispatched'[\s\S]*jobId:\s*dispatched\.jobId/)
  assert.match(route, /reconciliationRequired:\s*true/)
  assert.doesNotMatch(route, /isOneTimeTeacherProviderAcceptedAuditError[\s\S]{0,1200}status:\s*'failed'/)
})
