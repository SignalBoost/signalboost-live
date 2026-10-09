import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../app/api/auth/eu/export/route.ts', import.meta.url), 'utf8')
test('EU export is token authenticated, self-scoped, gated and never uses the US client', () => {
  assert.match(source, /euCustomerLaunchReadiness\(\)/)
  assert.match(source, /eu\.auth\.getUser\(token\)/)
  assert.match(source, /\.eq\('id', uid\)/)
  assert.match(source, /\.eq\('user_id', uid\)/)
  assert.match(source, /EU_SUPABASE_URL/)
  assert.match(source, /scope: 'eu_account_foundation_only'/)
  assert.doesNotMatch(source, /getAdminSupabase|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/)
})
