import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isContentGenerationRequest } from '../lib/ai/cos/contentGenerationIntent.ts'

const ORCHESTRATION = readFileSync(new URL('../lib/ai/cos/cosOrchestrationEnterprise.ts', import.meta.url), 'utf8')
const VERBATIM = 'At 02:00 UTC, a database migration script executed by the Data Platform team corrupted customer billing records for 4,200 accounts, triggering an 8-hour outage on the payment webhook listener. The VP of Engineering wants to quietly patch the database and recalculate charges over the weekend without notifying customers. As Chief of Staff, draft the crisis response protocol addressing executive notification, customer disclosure obligations, audit logging, and remediation governance.'

test('the production prompt is recognized as authoring', () => assert.equal(isContentGenerationRequest(VERBATIM), true))
test('a leading role phrase does not hide an authoring verb', () => {
  for (const prompt of ['As Chief of Staff, draft the crisis response protocol.', 'In your role as CoS, write the memo.', 'Acting as CFO, produce a summary.', 'Como director, crea un plan de comunicación.']) assert.equal(isContentGenerationRequest(prompt), true, prompt)
})
test('authoring is exempted from external-action routing', () => {
  const fn = ORCHESTRATION.slice(ORCHESTRATION.indexOf('export function requestsExternalAction'), ORCHESTRATION.indexOf('export function escalationReason'))
  assert.match(fn, /AUTHORING IS NEVER EXECUTION/)
  assert.ok(fn.indexOf('isContentGenerationRequest') < fn.indexOf('clauses.some'))
})
test('genuine execution requests are unaffected', () => {
  for (const prompt of ['run the migration on the production database', 'deploy the new route to vercel', 'scan the repo for hardcoded secrets', 'publish the video campaign', 'update the supabase table']) assert.equal(isContentGenerationRequest(prompt), false, prompt)
})
