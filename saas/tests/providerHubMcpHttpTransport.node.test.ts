import assert from 'node:assert/strict'
import test from 'node:test'

import { createMcpStreamableHttpTransportFactory } from '../provider-hub-host/mcp-streamable-http-transport.ts'

const scope = { tenantId: 'tenant-a', environmentId: 'test', portableId: 'portable-a' }

test('streamable HTTP transport pins endpoint, carries auth and preserves MCP session', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = []
  let call = 0
  const fetcher: typeof fetch = async (input, init = {}) => {
    seen.push({ url: String(input), init })
    call += 1
    if (call === 1) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'session-1' },
      })
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { ok: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const factory = createMcpStreamableHttpTransportFactory({
    fetcher,
    profiles: [{
      serverId: 'demo',
      transportRef: 'host:mcp:demo',
      endpoint: 'https://mcp.example.test/mcp',
      protocolVersion: '2025-11-25',
      authorization: () => 'Bearer secret-value',
      headers: { 'X-Test-Profile': 'bounded' },
    }],
  })
  const transport = factory.create({ serverId: 'demo', transportRef: 'host:mcp:demo', scope })
  await transport.send({ serverId: 'demo', scope, timeoutMs: 1000, request: { jsonrpc: '2.0', id: 1, method: 'initialize' } })
  await transport.send({ serverId: 'demo', scope, timeoutMs: 1000, request: { jsonrpc: '2.0', id: 2, method: 'tools/list' } })

  assert.equal(seen[0]?.url, 'https://mcp.example.test/mcp')
  assert.equal((seen[0]?.init.headers as Record<string, string>).Authorization, 'Bearer secret-value')
  assert.equal((seen[0]?.init.headers as Record<string, string>)['MCP-Protocol-Version'], '2025-11-25')
  assert.equal((seen[1]?.init.headers as Record<string, string>)['Mcp-Session-Id'], 'session-1')
  assert.equal(seen.every(item => item.init.redirect === 'error'), true)
})

test('streamable HTTP transport accepts SSE JSON-RPC and rejects unsafe static auth headers', async () => {
  const factory = createMcpStreamableHttpTransportFactory({
    fetcher: async () => new Response(
      'event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"tools":[]}}\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    ),
    profiles: [{
      serverId: 'demo',
      transportRef: 'host:mcp:demo',
      endpoint: 'https://mcp.example.test/mcp',
      protocolVersion: '2025-11-25',
    }],
  })
  const transport = factory.create({ serverId: 'demo', transportRef: 'host:mcp:demo', scope })
  assert.deepEqual(
    await transport.send({ serverId: 'demo', scope, timeoutMs: 1000, request: { jsonrpc: '2.0', id: 7, method: 'tools/list' } }),
    { jsonrpc: '2.0', id: 7, result: { tools: [] } },
  )

  const unsafe = createMcpStreamableHttpTransportFactory({
    profiles: [{
      serverId: 'unsafe',
      transportRef: 'host:mcp:unsafe',
      endpoint: 'https://mcp.example.test/mcp',
      protocolVersion: '2025-11-25',
      headers: { Authorization: 'Bearer must-not-live-in-profile' },
    }],
  })
  assert.throws(
    () => unsafe.create({ serverId: 'unsafe', transportRef: 'host:mcp:unsafe', scope }),
    /mcp_http_static_secret_header_rejected/,
  )
})

test('streamable HTTP transport fails closed on response limits and mismatched scope', async () => {
  const factory = createMcpStreamableHttpTransportFactory({
    fetcher: async () => new Response('x'.repeat(2048), { status: 200, headers: { 'content-type': 'application/json' } }),
    profiles: [{
      serverId: 'demo',
      transportRef: 'host:mcp:demo',
      endpoint: 'https://mcp.example.test/mcp',
      protocolVersion: '2025-11-25',
      maxResponseBytes: 1024,
    }],
  })
  const transport = factory.create({ serverId: 'demo', transportRef: 'host:mcp:demo', scope })
  await assert.rejects(
    () => transport.send({ serverId: 'demo', scope, timeoutMs: 1000, request: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }),
    /mcp_http_response_too_large/,
  )
  await assert.rejects(
    () => transport.send({
      serverId: 'demo',
      scope: { ...scope, tenantId: 'other' },
      timeoutMs: 1000,
      request: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    }),
    /mcp_http_scope_mismatch/,
  )
})
