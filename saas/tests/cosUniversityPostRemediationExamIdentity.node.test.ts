import assert from 'node:assert/strict'
import test from 'node:test'
import { cosUniversityExamRunKey } from '../lib/ai/cos/cosUniversityExamRunIdentity.ts'

const now = new Date('2026-09-10T21:30:00Z')
const target = { kind: 'subject' as const, subjectId: 'language_communication' as const }
const key = (at: Date, remediationAttemptId?: string) => cosUniversityExamRunKey({
  profile: 'cos_university_unseen_v1', agentId: 'software-specialist', target, now: at, remediationAttemptId,
})

test('scheduled exams remain idempotent for an agent, target and UTC day', () => {
  assert.equal(
    key(now),
    key(new Date('2026-09-10T23:59:59Z')),
  )
})

test('each durable remediation plan receives a distinct same-day independent exam', () => {
  const first = key(now, 'plan-one')
  const retry = key(now, 'plan-two')

  assert.notEqual(first, key(now))
  assert.notEqual(first, retry)
  assert.equal(first, key(now, 'plan-one'))
})
