import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('../lib/security/euUserSupabaseServer.ts', import.meta.url), 'utf8')
test('EU SSR sessions are isolated and unavailable until full launch readiness', () => {
  assert.match(source, /import 'server-only'/)
  assert.match(source, /euCustomerLaunchReadiness\(\)/)
  assert.match(source, /if \(!readiness\.ready\) throw/)
  assert.match(source, /name: 'itmounts-eu-auth'/)
  assert.match(source, /cookie\.name\.startsWith\('itmounts-eu-auth'\)/)
  assert.match(source, /EU_SUPABASE_URL/)
  assert.match(source, /EU_SUPABASE_ANON_KEY/)
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|US_SUPABASE/)
})

test('EU callback exchanges codes only in Frankfurt and never uses US onboarding', () => {
  const callback = readFileSync(new URL('../app/auth/eu/callback/route.ts', import.meta.url), 'utf8')
  assert.match(callback, /euCustomerLaunchReadiness\(\)/)
  assert.match(callback, /EU_SUPABASE_URL/)
  assert.match(callback, /EU_SUPABASE_ANON_KEY/)
  assert.match(callback, /exchangeCodeForSession\(code\)/)
  assert.match(callback, /name: 'itmounts-eu-auth'/)
  assert.doesNotMatch(callback, /NEXT_PUBLIC_SUPABASE_URL|\/onboarding|requestedNext/)
})
