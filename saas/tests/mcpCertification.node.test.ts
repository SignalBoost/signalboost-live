import assert from 'node:assert/strict'
import test from 'node:test'

import {
  certifyMcpProvider,
  MCP_PROVIDER_CERTIFICATION_VERSION,
  type McpCertifiableGateway,
} from '../provider-hub-host/mcp-certification.ts'

type Provider = 'github-mcp'

function gateway(input: {
  configured?: boolean
  capabilities?: readonly string[]
  invoke?: McpCertifiableGateway<Provider>['invoke']
} = {}): McpCertifiableGateway<Provider> {
  return {
    readiness: [{
      providerId: 'github-mcp',
      configured: input.configured ?? true,
      reason: input.configured === false ? 'missing_credential' : 'ready',
    }],
    async discover() {
      return (input.capabilities ?? ['mcp.github-mcp.contents.read']).map(capabilityId => ({ capabilityId }))
    },
    invoke: input.invoke ?? (async () => ({ ok: true, mode: 'executed' })),
  }
}

test('generic MCP certification passes exact projection and probes', async () => {
  const report = await certifyMcpProvider(gateway(), {
    providerId: 'github-mcp',
    expectedCapabilities: ['mcp.github-mcp.contents.read'],
    probes: [{
      id: 'repo_read',
      capabilityId: 'mcp.github-mcp.contents.read',
      args: { owner: 'SignalBoost', repo: 'signalboost-live', path: 'ONBOARD.md' },
      expect: { ok: true },
    }],
  })

  assert.equal(report.schemaVersion, MCP_PROVIDER_CERTIFICATION_VERSION)
  assert.equal(report.passed, true)
  assert.deepEqual(report.checks.map(item => [item.id, item.passed]), [
    ['readiness', true],
    ['exact_projection', true],
    ['probe:repo_read', true],
  ])
})

test('generic MCP certification fails closed when provider is not configured', async () => {
  const report = await certifyMcpProvider(gateway({ configured: false }), {
    providerId: 'github-mcp',
    expectedCapabilities: ['mcp.github-mcp.contents.read'],
    probes: [{
      id: 'repo_read',
      capabilityId: 'mcp.github-mcp.contents.read',
      args: {},
      expect: { ok: true },
    }],
  })

  assert.equal(report.passed, false)
  assert.equal(report.checks[0]?.id, 'readiness')
  assert.equal(report.checks[0]?.passed, false)
  assert.equal(report.checks[1]?.detail, 'not_run:not_ready')
  assert.equal(report.checks[2]?.detail, 'not_run:not_ready')
})

test('generic MCP certification rejects missing or unexpected projected capabilities', async () => {
  const report = await certifyMcpProvider(gateway({
    capabilities: ['mcp.github-mcp.contents.read', 'mcp.github-mcp.unexpected'],
  }), {
    providerId: 'github-mcp',
    expectedCapabilities: ['mcp.github-mcp.contents.read', 'mcp.github-mcp.code.search'],
  })

  assert.equal(report.passed, false)
  const projection = report.checks.find(item => item.id === 'exact_projection')
  assert.equal(projection?.passed, false)
  assert.match(projection?.detail || '', /missing=1;unexpected=1/)
})

test('certification evidence is metadata-only and does not retain probe arguments or provider errors', async () => {
  const report = await certifyMcpProvider(gateway({
    invoke: async () => ({ ok: false, mode: 'execution_failed', error: 'remote secret=server-private-value' }),
  }), {
    providerId: 'github-mcp',
    expectedCapabilities: ['mcp.github-mcp.contents.read'],
    probes: [{
      id: 'negative',
      capabilityId: 'mcp.github-mcp.contents.read',
      args: { token: 'client-private-value' },
      expect: { ok: false, mode: 'execution_failed', errorIncludes: 'remote secret=' },
    }],
  })

  assert.equal(report.passed, true)
  const serialized = JSON.stringify(report)
  assert.equal(serialized.includes('client-private-value'), false)
  assert.equal(serialized.includes('server-private-value'), false)
})
