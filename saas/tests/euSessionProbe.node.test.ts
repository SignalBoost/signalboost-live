import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const route = readFileSync(new URL('../app/api/auth/eu/session/route.ts', import.meta.url), 'utf8')
test('EU session probe authenticates only Frankfurt tokens and tenant ownership', () => {
  assert.match(route, /euCustomerLaunchReadiness\(\)/)
  assert.match(route, /EU_SUPABASE_URL/)
  assert.match(route, /eu\.auth\.getUser\(match\[1\]\)/)
  assert.match(route, /\.eq\('user_id', auth\.user\.id\)/)
  assert.match(route, /eu_tenant_not_provisioned/)
  assert.match(route, /Cache-Control.*no-store/)
  assert.doesNotMatch(route, /getAdminSupabase|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|\/dashboard/)
})
