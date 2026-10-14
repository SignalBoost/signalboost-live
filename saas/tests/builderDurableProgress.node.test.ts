import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('polling exposes saved progress, without replaying jobs or leaking raw test output', () => {
  const source = readFileSync(new URL('../app/api/builder/route.ts', import.meta.url), 'utf8')
  const get = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function POST'))
  assert.match(get, /lastActivityAt: job\.updatedAt/)
  assert.match(get, /filesWritten: job\.checkpoint\?\.workingFiles\?\.length/)
  assert.match(get, /verificationPending === true/)
  assert.match(get, /modelTimeoutDeferrals:/)
  assert.match(get, /testsPassed:/)
  assert.match(get, /testsFailed:/)
  assert.doesNotMatch(get, /after\(async/)
})
