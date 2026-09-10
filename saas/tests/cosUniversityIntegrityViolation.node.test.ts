import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('../lib/ai/cos/cosUniversityIntegrityViolation.ts', import.meta.url), 'utf8')

test('integrity penalties require host evidence and expire', () => {
  assert.match(source, /hostVerified === true && refs\.length > 0/)
  assert.match(source, /verifier: 'host_controller'/)
  assert.match(source, /expires_at: validUntil\.toISOString\(\)/)
  assert.match(source, /integrity_violation_validity_invalid/)
  assert.doesNotMatch(source, /\.from\([^)]*\)\.update\(|\.delete\(/)
})
