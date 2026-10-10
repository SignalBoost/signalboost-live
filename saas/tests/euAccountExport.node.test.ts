import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const helper = readFileSync(new URL('../lib/security/euAuthenticatedClient.ts', import.meta.url), 'utf8')
const exportRoute = readFileSync(new URL('../app/api/auth/eu/export/route.ts', import.meta.url), 'utf8')
const sessionRoute = readFileSync(new URL('../app/api/auth/eu/session/route.ts', import.meta.url), 'utf8')
test('EU account APIs share Frankfurt-only caller validation', () => {
  assert.match(helper, /euCustomerLaunchReadiness\(\)/)
  assert.match(helper, /EU_SUPABASE_URL/)
  assert.match(helper, /\.auth\.getUser\(token\)/)
  assert.match(helper, /persistSession: false/)
  assert.match(exportRoute, /authenticateEuBearer\(request\.headers\.get\('authorization'\)\)/)
  assert.match(sessionRoute, /authenticateEuBearer\(request\.headers\.get\('authorization'\)\)/)
  assert.match(exportRoute, /\.eq\('id', uid\)/)
  assert.match(exportRoute, /\.eq\('user_id', uid\)/)
  assert.match(sessionRoute, /\.eq\('user_id', auth\.user\.id\)/)
  assert.match(sessionRoute, /eu_tenant_not_provisioned/)
  assert.match(exportRoute, /scope: 'eu_regional_account_and_application_records'/)
  for (const table of ['eu_projects','eu_builder_workspaces','eu_builder_workspace_files','eu_data_rights_requests']) assert.ok(exportRoute.includes(table))
  assert.match(exportRoute, /eu_export_exceeds_safe_limit/)
  assert.match(exportRoute, /\.eq\('tenant_id', tenantId\)/)
  for (const source of [helper, exportRoute, sessionRoute]) {
    assert.doesNotMatch(source, /getAdminSupabase|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/)
  }
})
