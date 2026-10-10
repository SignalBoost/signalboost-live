import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const auth = readFileSync(new URL('../lib/security/resolveEuTenant.ts',import.meta.url),'utf8')
const workspace = readFileSync(new URL('../app/api/eu/workspaces/route.ts',import.meta.url),'utf8')
const files = readFileSync(new URL('../app/api/eu/workspace-files/route.ts',import.meta.url),'utf8')
const projects = readFileSync(new URL('../app/api/eu/projects/route.ts',import.meta.url),'utf8')
const portal = readFileSync(new URL('../components/eu/EuWorkspaceControls.tsx',import.meta.url),'utf8')
const schema = readFileSync(new URL('../supabase/eu-migrations/eu_builder_and_projects_tenant_scoped.sql',import.meta.url),'utf8')
test('EU workspace and project APIs share Frankfurt Auth and server-owned tenant IDs',()=>{
 assert.match(auth,/authenticateEuBearer/)
 assert.match(auth,/eu_auth_profiles/)
 assert.match(auth,/\.eq\('user_id',auth\.user\.id\)/)
 for (const src of [workspace,files,projects]) {
  assert.match(src,/resolveEuTenant\(/)
  assert.match(src,/eu-/)
  assert.match(src,/owner\.tenantId/)
  assert.match(src,/owner\.userId/)
  assert.doesNotMatch(src,/getAdminSupabase|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/)
 }
 assert.match(files,/Buffer\.byteLength/)
 assert.match(files,/onConflict: 'workspace_id,path'/)
 assert.match(schema,/enable row level security/g)
 assert.match(schema,/with check/gi)
 assert.match(portal,/\/api\/eu\/workspaces/)
 assert.match(portal,/\/api\/eu\/workspace-files/)
 assert.match(portal,/\/api\/eu\/projects/)
 assert.doesNotMatch(portal,/\/dashboard|utils\/supabase\/client/)
})
