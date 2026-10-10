import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const source=readFileSync(new URL('../app/api/auth/eu/deletion-preflight/route.ts',import.meta.url),'utf8')
const portal=readFileSync(new URL('../components/eu/EuAccountControls.tsx',import.meta.url),'utf8')
test('EU deletion preflight is Frankfurt tenant-scoped and non-destructive',()=>{
 assert.match(source,/resolveEuTenant/)
 assert.match(source,/\.eq\('user_id', owner\.userId\)/)
 assert.match(source,/\.eq\('tenant_id', owner\.tenantId\)/)
 assert.match(source,/deletionExecuted: false/)
 assert.match(source,/automaticPurgeAvailable: false/)
 assert.doesNotMatch(source,/getAdminSupabase|deleteUser\(|\.delete\(\)|SUPABASE_SERVICE_ROLE_KEY/)
 assert.match(portal,/\/api\/auth\/eu\/deletion-preflight/)
 assert.match(portal,/Review deletion scope/)
})
