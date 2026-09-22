import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  UNIVERSAL_MCP_CERTIFICATION_STATUS,
  UNIVERSAL_MCP_CERTIFICATION_STATUS_VERSION,
} from '../provider-hub-host/universal-mcp-certification-status.ts'

test('Universal MCP certification status is truthful at four of five providers', () => {
  const status = UNIVERSAL_MCP_CERTIFICATION_STATUS
  assert.equal(status.schemaVersion, UNIVERSAL_MCP_CERTIFICATION_STATUS_VERSION)
  assert.equal(status.requiredProviders, 5)
  assert.equal(status.certifiedProviders, 4)
  assert.equal(status.productionReady, false)
  assert.equal(status.blocker, 'figma-mcp')

  const byId = new Map(status.providers.map(item => [item.providerId, item]))
  for (const providerId of ['github-mcp', 'supabase-mcp', 'context7-mcp', 'vercel-mcp']) {
    assert.equal(byId.get(providerId as any)?.state, 'certified')
    assert.match(String(byId.get(providerId as any)?.evidence || ''), /^vercel-preview:/)
  }
  assert.equal(byId.get('figma-mcp')?.state, 'blocked_external')
  assert.equal(byId.get('figma-mcp')?.blocker, 'provider_client_approval_required')

  const serialized = JSON.stringify(status)
  for (const forbidden of ['access_token', 'oauth_token', 'apiKey', 'password', 'secret']) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false)
  }
})

test('Universal MCP certification is owner-only status metadata', async () => {
  const [adminRoute, selfRoute, dashboard] = await Promise.all([
    readFile(new URL('../app/api/admin/provider-hub/status/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/provider-hub/status/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/provider-hub/ProviderHubStatusDashboard.tsx', import.meta.url), 'utf8'),
  ])

  assert.match(adminRoute, /UNIVERSAL_MCP_CERTIFICATION_STATUS/)
  assert.match(adminRoute, /universalMcp/)
  assert.doesNotMatch(selfRoute, /UNIVERSAL_MCP_CERTIFICATION_STATUS|universalMcp/)
  assert.match(dashboard, /surface\.universalMcp/)
  assert.match(dashboard, /productionReady/)
})

test('full Universal MCP Actions runner remains server-side skipped until Figma approval and OAuth readiness', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/universal-mcp-live-acceptance.yml', import.meta.url), 'utf8')
  assert.match(workflow, /FIGMA_MCP_CLIENT_APPROVED == 'true'/)
  assert.match(workflow, /FIGMA_MCP_USER_OAUTH_READY == 'true'/)
  assert.match(workflow, /if: \$\{\{ vars\.FIGMA_MCP_CLIENT_APPROVED/)
  assert.doesNotMatch(workflow, /FIGMA_MCP_OAUTH_ACCESS_TOKEN/)
})

test('baseline evidence records Supabase and Vercel certified while Figma remains externally blocked', async () => {
  const source = await readFile(new URL('../scripts/mcp-gateway/run-universal-mcp-baseline-acceptance.ts', import.meta.url), 'utf8')
  assert.match(source, /'supabase-mcp': 'certified_via_vercel_preview'/)
  assert.match(source, /'vercel-mcp': 'certified_via_vercel_preview'/)
  assert.match(source, /'figma-mcp': 'provider_client_approval_required'/)
  assert.doesNotMatch(source, /'supabase-mcp': 'repository_credential_required'/)
  assert.doesNotMatch(source, /'vercel-mcp': 'repository_credential_required'/)
})
