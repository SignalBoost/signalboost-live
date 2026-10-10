import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const profile = readFileSync(new URL('../app/api/auth/eu/profile/route.ts', import.meta.url), 'utf8')
test('EU profile access verifies Frankfurt caller and immutable tenant ownership', () => {
  assert.match(profile, /authenticateEuBearer/)
  assert.match(profile, /eu_auth_profiles/)
  assert.match(profile, /\.eq\('user_id',auth\.user\.id\)/)
  assert.match(profile, /\.eq\('id', auth\.user\.id\)/)
  assert.match(profile, /invalid_fields/)
  assert.match(profile, /consentAiTraining/)
  assert.match(profile, /private, no-store/)
  assert.doesNotMatch(profile, /getAdminSupabase|SUPABASE_SERVICE_ROLE_KEY|\/dashboard/)
})
