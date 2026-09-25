import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  UNIVERSAL_MCP_PROVIDER_CERTIFICATIONS,
  universalMcpCertificationSummary,
} from '../provider-hub-host/universal-mcp-certification-status.ts'

test('Universal MCP certification truth keeps full suite incomplete while Figma and Vercel await provider approval', () => {
  const summary = universalMcpCertificationSummary()
  assert.equal(summary.totalProviders, 5)
  assert.equal(summary.certifiedProviders, 3)
  assert.equal(summary.blockedExternalProviders, 2)
  assert.equal(summary.fullSuiteCertified, false)

  const states = new Map(summary.providers.map(item => [item.providerId, item.state]))
  assert.equal(states.get('github-mcp'), 'certified')
  assert.equal(states.get('context7-mcp'), 'certified')
  assert.equal(states.get('supabase-mcp'), 'certified')
  assert.equal(states.get('vercel-mcp'), 'blocked_external')
  assert.equal(states.get('figma-mcp'), 'blocked_external')
})

test('Universal MCP certification evidence never marks Figma or Vercel certified before durable provider approval', () => {
  for (const providerId of ['figma-mcp', 'vercel-mcp'] as const) {
    const provider = UNIVERSAL_MCP_PROVIDER_CERTIFICATIONS.find(item => item.providerId === providerId)
    assert.ok(provider)
    assert.equal(provider.state, 'blocked_external')
    assert.equal(provider.evidence, 'provider_client_approval_pending')
    assert.match(provider.detail, /approval|allowlist/i)
  }
})

test('owner MCP API exposes runtime connectivity separately from certification truth', async () => {
  const source = await readFile(new URL('../app/api/admin/provider-hub/mcp/route.ts', import.meta.url), 'utf8')
  assert.match(source, /universalMcpCertificationSummary/)
  assert.match(source, /providers,/)
  assert.match(source, /certification,/)
})
