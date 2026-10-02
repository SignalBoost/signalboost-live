// saas/tests/quarantineStallDrain.node.test.ts
// Production 2026-10-02: 11 students sat in quarantine for DAYS. The resolution runs every 15 minutes and had no bug
// in its reasoning - two of its own outcomes simply never change a status, so they were parking lots:
//
//   `leave_for_review` hands the student to the quarantine review, but that review skips any artifact where
//   `history.hasVerdict || history.liveStart`. A student exhausted by OUR errors that also carries a verdict is
//   refused by the review every run and left untouched by the resolution. Closed loop, no exit.
//
//   `hold_for_investigation` is terminal for a student with no recorded reason that was already returned to the exam
//   once. Making it visible instead of looping was right; leaving it there forever was not.
//
// Both outcomes are `ours: true` and neither is a FAIL, so the owner's rule already decides them - our fault, so the
// student leaves. These tests fail the build if either outcome becomes permanent again, and if the stall escalation
// ever reaches a student who really did fail.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  QUARANTINE_STALL_LIMIT_MS,
  decideQuarantineResolution,
} from '../lib/ai/cos/cosUniversityQuarantineResolution.ts'
import type { QuarantineClassification, QuarantineReason } from '../lib/ai/cos/cosUniversityQuarantineReasons.ts'

const source = readFileSync(
  new URL('../lib/ai/cos/cosUniversityQuarantineResolution.ts', import.meta.url), 'utf8')

const classify = (reason: QuarantineReason): QuarantineClassification => Object.freeze({
  reason,
  since: '2026-09-26T10:00:00.000Z',
  failedGates: [],
  failedCompetencies: [],
  lastError: '',
}) as unknown as QuarantineClassification

const FRESH = QUARANTINE_STALL_LIMIT_MS - 1
const STALLED = QUARANTINE_STALL_LIMIT_MS
const DAYS = 6 * 24 * 60 * 60 * 1000

test('the stall limit is a bounded wait, not a new parking lot', () => {
  assert.equal(QUARANTINE_STALL_LIMIT_MS, 6 * 60 * 60 * 1000)
  // 24 ticks of the 15-minute cron before it escalates: the review gets ample first refusal.
  assert.ok(QUARANTINE_STALL_LIMIT_MS / (15 * 60 * 1000) >= 20)
})

test('a student exhausted by OUR errors leaves once the review has demonstrably declined it', () => {
  const reason: QuarantineReason = 'exhausted_our_errors'
  const fresh = decideQuarantineResolution({ classification: classify(reason), candidateId: 'mass:aaaa1111', alreadyReturned: false, quarantinedForMs: FRESH })
  assert.equal(fresh.action, 'leave_for_review', 'the review must still get first refusal')
  assert.equal(fresh.ours, true)

  for (const waited of [STALLED, DAYS]) {
    const stalled = decideQuarantineResolution({ classification: classify(reason), candidateId: 'mass:aaaa1111', alreadyReturned: false, quarantinedForMs: waited })
    assert.equal(stalled.action, 'dismiss', `a stalled our-errors student must leave, waited ${waited}`)
    assert.equal(stalled.ours, true, 'it leaves as OURS, never as a FAIL')
    assert.equal(stalled.reason, reason, 'the recorded reason is unchanged by the escalation')
  }
})

test('a student that already had its retry leaves immediately, whatever the clock says', () => {
  // Production 2026-10-02: quarantine fell 11 -> 7 and stopped there. quarantinedForMs is measured from the artifact
  // row's updated_at, and a quarantine -> exam -> quarantine lap REWRITES updated_at, so a cycling student rewinds its
  // own stall timer every lap and can never reach the limit. The retry is a durable assurance event, so no lap resets
  // it. This must hold at every wait, including zero.
  for (const reason of ['no_recorded_reason', 'exhausted_our_errors'] as QuarantineReason[]) {
    for (const waited of [0, FRESH, STALLED, DAYS]) {
      const decision = decideQuarantineResolution({ classification: classify(reason), candidateId: 'mass:bbbb2222', alreadyReturned: true, quarantinedForMs: waited })
      assert.equal(decision.action, 'dismiss', `${reason} already retried must not wait on a resettable clock, waited ${waited}`)
      assert.equal(decision.ours, true, 'it leaves as OURS, never as a FAIL')
      assert.equal(decision.reason, reason, 'the recorded reason is unchanged')
    }
  }
})

test('a non-mass student, which has no automatic retry at all, keeps the bounded hold', () => {
  const reason: QuarantineReason = 'no_recorded_reason'
  const fresh = decideQuarantineResolution({ classification: classify(reason), candidateId: 'single:cccc3333', alreadyReturned: false, quarantinedForMs: FRESH })
  assert.equal(fresh.action, 'hold_for_investigation')
  const stalled = decideQuarantineResolution({ classification: classify(reason), candidateId: 'single:cccc3333', alreadyReturned: false, quarantinedForMs: DAYS })
  assert.equal(stalled.action, 'dismiss')
  assert.equal(stalled.ours, true)
})

test('a first-time mass student with no recorded reason still gets its exam back, however long it waited', () => {
  // The escalation must never pre-empt the one automatic retry. Waiting is not evidence against a student that has
  // not yet been re-examined even once.
  for (const waited of [0, FRESH, DAYS]) {
    const decision = decideQuarantineResolution({
      classification: classify('no_recorded_reason'),
      candidateId: 'mass:dddd4444',
      alreadyReturned: false,
      quarantinedForMs: waited,
    })
    assert.equal(decision.action, 'return_to_exam', `a never-returned student must be re-armed, waited ${waited}`)
    assert.equal(decision.ours, true)
  }
})

test('the stall escalation never touches a student that really failed', () => {
  // These are final by design. A long wait must not convert a merit FAIL into an "ours" dismissal, nor the reverse.
  for (const reason of ['exam_failed', 'residency_failed', 'exhausted_real_failures'] as QuarantineReason[]) {
    for (const waited of [0, FRESH, DAYS]) {
      const decision = decideQuarantineResolution({ classification: classify(reason), candidateId: 'mass:eeee5555', alreadyReturned: true, quarantinedForMs: waited })
      assert.equal(decision.action, 'dismiss')
      assert.equal(decision.ours, false, `${reason} must stay the student's own failure`)
    }
  }
  // Broken exam data was already ours and already terminal; the escalation must not change its classification.
  const defect = decideQuarantineResolution({ classification: classify('exam_data_defect'), candidateId: 'mass:ffff6666', alreadyReturned: true, quarantinedForMs: DAYS })
  assert.equal(defect.action, 'dismiss')
  assert.equal(defect.ours, true)
})

test('an unknown or unreadable wait is treated as not yet stalled', () => {
  // Fail safe: a missing timestamp must keep the student's normal outcome, never dismiss it by accident.
  for (const waited of [undefined, Number.NaN, -1, 0]) {
    const decision = decideQuarantineResolution({
      classification: classify('exhausted_our_errors'),
      candidateId: 'mass:aaaa1111',
      alreadyReturned: false,
      quarantinedForMs: waited as number,
    })
    assert.equal(decision.action, 'leave_for_review', `wait ${String(waited)} must not escalate`)
  }
})

test('the live resolution measures the real wait and records it on the dismissal', () => {
  // The wait comes from the artifact row, so updated_at must be selected and fed to the decision.
  assert.match(source, /\.select\('candidate_id,subject_id,trained_artifact_hash,created_at,updated_at,status'\)/)
  assert.match(source, /const quarantinedSince = Date\.parse\(updatedAt \|\| student\.createdAt \|\| ''\)/)
  assert.match(source, /quarantinedForMs,\n/)
  // Auditable, so a dismissal can always be told apart from one its reason decided on its own.
  assert.match(source, /stalledPastLimit: quarantinedForMs >= QUARANTINE_STALL_LIMIT_MS/)
  assert.match(source, /owner_explicit_direction_2026-10-02_quarantine_is_not_a_parking_lot/)
  // Still conditional on the student actually being quarantined, so a concurrent run cannot act twice.
  assert.match(source, /\.eq\('status', 'quarantined'\)\s*\n\s*\.select\('id'\)/)
  assert.match(source, /productionTrafficAuthorized: false/)
})
// end of saas/tests/quarantineStallDrain.node.test.ts (if this line is missing, the paste was cut short)
