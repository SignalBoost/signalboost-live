import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../app/api/auth/eu/data-rights/route.ts', import.meta.url),'utf8')
test('EU privacy requests are caller-owned and never falsely marked completed',()=>{
  assert.match(src,/authenticateEuBearer/)
  assert.match(src,/eu_auth_profiles/)
  assert.match(src,/\.eq\('user_id',auth\.user\.id\)/)
  assert.match(src,/\.eq\('tenant_id',tenantId\)/)
  assert.match(src,/processingComplete: false/)
  assert.match(src,/status: 202/)
  assert.doesNotMatch(src,/deleteUser\(|getAdminSupabase|NEXT_PUBLIC_SUPABASE_URL/)
})
