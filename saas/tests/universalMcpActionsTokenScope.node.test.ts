import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { GITHUB_MCP_PROFILE } from '../provider-hub-host/universal-mcp-profiles.ts'

test('GitHub Actions MCP certification scopes repository token without removing runtime identity capability', async () => {
  const baseline = await readFile(new URL('../scripts/mcp-gateway/run-universal-mcp-baseline-acceptance.ts', import.meta.url), 'utf8')
  const full = await readFile(new URL('../scripts/mcp-gateway/run-universal-mcp-acceptance.ts', import.meta.url), 'utf8')

  assert.match(baseline, /capabilityName !== 'identity\.read'/)
  assert.match(full, /capabilityName !== 'identity\.read'/)
  assert.equal(GITHUB_MCP_PROFILE.tools.some(item => item.capabilityName === 'identity.read'), true)
})
