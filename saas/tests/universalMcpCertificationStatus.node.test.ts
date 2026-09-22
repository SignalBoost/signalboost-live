import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import {
  UNIVERSAL_MCP_PROVIDER_CERTIFICATIONS,
  universalMcpCertificationSummary,
} from '../provider-hub-host/universal-mcp-certification-status.ts'

test('Universal MCP certification truth keeps full suite incomplete while Figma is externally blocked', () => {
  const summary = universalMcpCertificationSummary()
  assert.equal(summary.totalProviders, 5)
  assert.equal(summary.certifiedProviders, 4)
  assert.equal(summary.blockedExternalProviders, 1)
  assert.equal(summary.fullSuiteCertified, false)

  const states = new Map(summary.providers.map(item => [item.providerId, item.state]))
  assert.equal(states.get('github-mcp'), 'certified')
  assert.equal(states.get('context7-mcp'), 'certified')
  assert.equal(states.get('supabase-mcp'), 'certified')
  assert.equal(states.get('vercel-mcp'), 'certified')
  assert.equal(states.get('figma-mcp'), 'blocked_external')
})

test('Universal MCP certification evidence never marks Figma certified before provider approval', () => {
  const figma = UNIVERSAL_MCP_PROVIDER_CERTIFICATIONS.find(item => item.providerId === 'figma-mcp')
  assert.ok(figma)
  assert.equal(figma.state, 'blocked_external')
  assert.equal(figma.evidence, 'provider_client_approval_pending')
  assert.match(figma.detail, /pending provider client approval/i)
})

test('owner MCP API exposes runtime connectivity separately from certification truth', async () => {
  const source = await readFile(new URL('../app/api/admin/provider-hub/mcp/route.ts', import.meta.url), 'utf8')
  assert.match(source, /universalMcpCertificationSummary/)
  assert.match(source, /providers,/)
  assert.match(source, /certification,/)
})
