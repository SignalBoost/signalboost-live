import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')

test('historical acceptance endpoint is user-scoped and read-only', () => {
  const get = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function POST'))
  assert.match(get, /getBuilderJobForUser\(jobId, access\.userId\)/)
  const branch = get.slice(get.indexOf("url.searchParams.get('report') === 'acceptance'"), get.indexOf('return noStore({\n        ...(job.result'))
  assert.match(branch, /builderAcceptanceReport\(/)
  // The saved job result is read with or without optional chaining (#4754 wrote saved?.acceptanceLedger).
  assert.match(branch, /saved\??\.receipts/)
  assert.match(branch, /saved\??\.acceptanceLedger/)
  assert.match(branch, /saved\??\.finalProof/)
  assert.match(branch, /readOnly: true/)
  assert.doesNotMatch(branch, /runBuilderJob\(|enqueueBuilderJob\(|createBuilderCodingAiPort\(|finishBuilderJob\(/)
})

test('unavailable historic proof fails closed instead of inventing a PASS', () => {
  assert.match(source, /builder_acceptance_evidence_unavailable/)
  assert.match(source, /status: 409/)
})
