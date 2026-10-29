import assert from 'node:assert/strict'
import test from 'node:test'
import { USER_OUTCOME_AUTHORITY } from '../lib/ai/cos/instructionContract.ts'

test('COS owns the underlying customer outcome, not a URL-only response', () => {
  assert.match(USER_OUTCOME_AUTHORITY, /Do not stop at a URL, citation, document summary, or referral/)
  assert.match(USER_OUTCOME_AUTHORITY, /what the authoritative source means for the customer/)
  assert.match(USER_OUTCOME_AUTHORITY, /offer one specific useful follow-up/)
  assert.match(USER_OUTCOME_AUTHORITY, /domain, role, and constraints across follow-up turns/)
  assert.match(USER_OUTCOME_AUTHORITY, /user-supplied legal claim as unverified/)
  assert.match(USER_OUTCOME_AUTHORITY, /Proactivity never grants authority/)
})
