import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const ui=readFileSync(new URL('../app/eu/access/page.tsx',import.meta.url),'utf8')
const bootstrap=readFileSync(new URL('../app/api/auth/eu/config/route.ts',import.meta.url),'utf8')
test('European browser registration and sign-in cannot use US auth or dashboard',()=>{
 assert.match(ui,/createBrowserClient\(/)
 assert.match(ui,/\/api\/auth\/eu\/config/)
 assert.match(ui,/\/auth\/eu\/callback/)
 assert.match(ui,/\/api\/auth\/eu\/complete-enrollment/)
 assert.match(ui,/\/api\/auth\/eu\/session/)
 assert.match(ui,/proposedEnrollmentRegion\(country\)/)
 assert.match(ui,/\/eu\/account/)
 assert.doesNotMatch(ui,/\/auth\/callback\?next|\/onboarding|\/dashboard|utils\/supabase\/client|NEXT_PUBLIC_SUPABASE_URL/)
})
test('Regional public auth configuration exposes only anon credentials behind launch gate',()=>{
 assert.match(bootstrap,/euCustomerLaunchReadiness\(\)/)
 assert.match(bootstrap,/EU_SUPABASE_ANON_KEY/)
 assert.match(bootstrap,/itmounts-eu-auth/)
 assert.doesNotMatch(bootstrap,/EU_SUPABASE_SERVICE_ROLE_KEY|getEuAdminSupabase/)
})
