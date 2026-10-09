import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../app/api/auth/eu/complete-enrollment/route.ts', import.meta.url), 'utf8')

test('EU enrollment completion is gated and never trusts a user ID from caller', () => {
  assert.match(source, /euRuntimeReadiness\(\)/)
  assert.match(source, /if \(!readiness\.ready\)/)
  assert.match(source, /eu\.auth\.getUser\(match\[1\]\)/)
  assert.match(source, /euAuthUserId: data\.user\.id/)
  assert.match(source, /proposedEnrollmentRegion\(record\.countryCode\)/)
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_URL|utils\/supabase\/client/)
  assert.doesNotMatch(source, /record\.userId|record\.tenantId/)
})
