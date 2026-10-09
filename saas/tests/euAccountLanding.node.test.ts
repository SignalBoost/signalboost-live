import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const page = readFileSync(new URL('../app/eu/account/page.tsx', import.meta.url), 'utf8')
const callback = readFileSync(new URL('../app/auth/eu/callback/route.ts', import.meta.url), 'utf8')
test('EU callback destination exists and cannot silently route into the US dashboard', () => {
  assert.match(callback, /new URL\('\/eu\/account'/)
  assert.match(page, /euCustomerLaunchReadiness\(\)/)
  assert.match(page, /getEuUserSupabase\(\)/)
  assert.match(page, /eu\.auth\.getUser\(\)/)
  assert.match(page, /eu_auth_profiles/)
  assert.doesNotMatch(page, /getServerSupabase|getAdminSupabase|\/dashboard|\/onboarding/)
})
