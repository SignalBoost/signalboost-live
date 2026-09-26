import assert from 'node:assert/strict'
import test from 'node:test'
import { GRADUATE_ROTATION_LEASE_MS, selectGraduateFor24HourLease } from '../lib/ai/cos/cosUniversityGraduateRotation.ts'

const graduate = (n: number) => ({
  registryId: `registry-${n}`,
  candidateId: `candidate-${n}`,
  trainedArtifactHash: String(n).padStart(64, '0'),
})

test('one eligible graduate stays selected without fake lifecycle churn', () => {
  const only = graduate(1)
  const decision = selectGraduateFor24HourLease([only], new Date('2026-09-26T12:00:00Z'))
  assert.equal(decision.selected, only)
  assert.equal(decision.previous, null)
  assert.equal(decision.reason, 'single_eligible_graduate')
})

test('selection is stable for the complete 24-hour lease', () => {
  const pool = [graduate(1), graduate(2), graduate(3)]
  const start = new Date('2026-09-26T00:00:01Z')
  const end = new Date(start.getTime() + GRADUATE_ROTATION_LEASE_MS - 2)
  assert.equal(selectGraduateFor24HourLease(pool, start).selected?.candidateId, selectGraduateFor24HourLease(pool, end).selected?.candidateId)
})

test('next 24-hour lease rotates to the next eligible artifact and retains rollback predecessor', () => {
  const pool = [graduate(1), graduate(2), graduate(3)]
  const before = selectGraduateFor24HourLease(pool, new Date('2026-09-26T23:59:59Z'))
  const after = selectGraduateFor24HourLease(pool, new Date('2026-09-27T00:00:00Z'))
  assert.notEqual(after.selected?.candidateId, before.selected?.candidateId)
  assert.equal(after.previous?.candidateId, before.selected?.candidateId)
  assert.equal(after.reason, 'scheduled_24h_rotation')
})

test('pool ordering cannot change the selected artifact', () => {
  const pool = [graduate(3), graduate(1), graduate(2)]
  const now = new Date('2026-09-27T10:00:00Z')
  const a = selectGraduateFor24HourLease(pool, now)
  const b = selectGraduateFor24HourLease([...pool].reverse(), now)
  assert.equal(a.selected?.candidateId, b.selected?.candidateId)
  assert.equal(a.previous?.candidateId, b.previous?.candidateId)
})

test('empty eligible pool fails closed', () => {
  const decision = selectGraduateFor24HourLease([], new Date('2026-09-27T10:00:00Z'))
  assert.equal(decision.selected, null)
  assert.equal(decision.reason, 'no_eligible_graduate')
})
