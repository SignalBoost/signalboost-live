// saas/tests/cosEditFactGuard.node.test.ts
//
// Production 2026-10-15: "edit my reply" to an airport-pickup thread came back with "my arrival on
// June 18 at 8:10 p.m. local time" and a "Subject:" line — both from the quoted thread, not the
// owner's draft. The guard finds number-bearing details the user did not write.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripUnrequestedSubjectLine, unsupportedEditDetails, userAuthoredText } from '../lib/ai/cos/editFactGuard.ts'

const REQUEST = [
  'edit my reply - Hi Sam, thank you for your email. Yes, you can submit an airport pick up. What time are the office hours? I am wondering why the pick up is at 6:20 am.',
  '',
  'Regards,',
  'Alex',
  'Cell Phone + 1 555 010 7914',
  '',
  'From: Sam Example <sam@example.org>',
  'Sent: Monday, May 18, 2026 1:45 PM',
  'To: Alex <alex@example.org>',
  'Subject: RE: Hotel Reservation (June 18 – October 16)',
  '',
  'Can I submit an airport pickup for your arrival on June 18 at 10:10 p.m.?',
].join('\n')

test('details copied from the quoted thread are flagged; the user’s own numbers are not', () => {
  assert.doesNotMatch(userAuthoredText(REQUEST), /From: Sam/)
  const invented = 'Hi Sam,\n\nYes, please submit the airport pickup request for my arrival on June 18 at 8:10 p.m. local time. Why is the pickup at 6:20 a.m.?\n\nRegards,\nAlex\nCell Phone +1 555 010 7914'
  assert.deepEqual(unsupportedEditDetails(invented, REQUEST), ['18', '8:10'])
  const faithful = 'Hi Sam,\n\nYes, you can submit an airport pickup. What are the office hours? Why is the pickup at 6:20 a.m.?\n\nRegards,\nAlex\nCell Phone +1 555 010 7914'
  assert.deepEqual(unsupportedEditDetails(faithful, REQUEST), [])
  // Spelled-out numbers the user wrote may become digits.
  assert.deepEqual(unsupportedEditDetails('I will send 2 copies.', 'edit - i will send two copies'), [])
  assert.deepEqual(unsupportedEditDetails('I sent 4 vouchers.', 'edit - i sent the vouchers'), ['4'])
})

test('a Subject line the user did not write is removed; one they wrote is kept', () => {
  assert.equal(stripUnrequestedSubjectLine('Subject: RE: Hotel\n\nHi Sam,\nThanks.', REQUEST), 'Hi Sam,\nThanks.')
  assert.equal(stripUnrequestedSubjectLine('Hi Sam,\nThanks.', REQUEST), 'Hi Sam,\nThanks.')
  const own = 'edit - Subject: Visit\nhi sam thanks'
  assert.equal(stripUnrequestedSubjectLine('Subject: Visit\n\nHi Sam, thanks.', own), 'Subject: Visit\n\nHi Sam, thanks.')
})

test('the fast lane applies the guard and repairs flagged details before release', () => {
  const primary = readFileSync(join(process.cwd(), 'app/api/cos-primary/route.ts'), 'utf8')
  const fast = primary.slice(primary.indexOf('async function runFastTextTransform('), primary.indexOf('export const FAST_AUTHORING_TIMEOUT_MS'))
  assert.match(fast, /let reply=stripUnrequestedSubjectLine\(drafted\.answer,input\)/)
  assert.match(fast, /const unsupported=unsupportedEditDetails\(reply,input\)/)
  assert.match(fast, /systemPrompt:EDIT_DETAIL_REPAIR_INSTRUCTIONS/)
  assert.match(fast, /return\{reply,reasonerLabel,reviewVerdict:drafted\.verdict\}/)
})
