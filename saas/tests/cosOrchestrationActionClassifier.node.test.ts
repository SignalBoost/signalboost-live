// saas/tests/cosOrchestrationActionClassifier.node.test.ts
//
// requestsExternalAction() was over-broad: a diagnostic question phrased with an execution verb
// ("check why the table is slow") matched the same regex as a real command ("check the users table
// and report row counts") and got routed to the governed-executor action path, which has no local
// implementation. This pins the fix: diagnostic/interrogative phrasing must never be an action, even
// when it contains an execution verb + target noun; real imperative commands must still be caught.

import assert from 'node:assert/strict'
import test from 'node:test'
import { isProvenanceIntrospection, requestsExternalAction } from '../lib/ai/cos/cosOrchestrationEnterprise.ts'

test('a diagnostic question with a verb immediately followed by a wh-word is not an action', () => {
  assert.equal(requestsExternalAction('check why the table is slow'), false)
  assert.equal(requestsExternalAction('audit what changed in the database'), false)
  assert.equal(requestsExternalAction('investigate how the campaign is performing'), false)
})

test('a question that opens on an interrogative/auxiliary word is not an action regardless of a buried verb', () => {
  assert.equal(requestsExternalAction('why did the database query take so long to run'), false)
  assert.equal(requestsExternalAction('what happened when we deployed the last release'), false)
  assert.equal(requestsExternalAction('is the production database healthy'), false)
  assert.equal(requestsExternalAction('does the repo need a fix'), false)
})

test('a sentence ending in a question mark is not an action even with verb+target present', () => {
  assert.equal(requestsExternalAction('can you check the logs for errors?'), false)
})

test('real imperative commands with a verb and target still classify as actions', () => {
  assert.equal(requestsExternalAction('check the users table and report row counts'), true)
  assert.equal(requestsExternalAction('deploy the latest commit to production'), true)
  assert.equal(requestsExternalAction('search the repo for TODO comments'), true)
  assert.equal(requestsExternalAction('send the campaign to the prospect list'), true)
  assert.equal(requestsExternalAction('Render a video using Provider X. If unavailable, automatically switch to the best alternative based on learned performance.'), true)
})

test('plain diagnostic prose with no execution verb at all is unaffected either way', () => {
  assert.equal(requestsExternalAction('the p50 doubled after autovacuum ran'), false)
})

test('provenance introspection still short-circuits before the action check, unchanged', () => {
  assert.equal(requestsExternalAction('which model generated that previous answer'), false)
})

test('plain-language source follow-ups are provenance introspection, not fresh factual lookups', () => {
  assert.equal(isProvenanceIntrospection('Show me where from you got the answer for the question?'), true)
  assert.equal(isProvenanceIntrospection('Where did you get that answer from?'), true)
  assert.equal(isProvenanceIntrospection('What sources did you use for your previous response?'), true)
  assert.equal(isProvenanceIntrospection('show me where the answers came from?'), true)
})
