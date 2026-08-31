import assert from 'node:assert/strict'
import test from 'node:test'
import { MCP_PROTOCOL_VERSION } from '../agent-gateway/mcp-server.ts'
import { createPortableConnectorRuntime } from '../provider-hub-core/connector-runtime.ts'
import { createMcpOutboundClient, type McpOutboundTransport } from '../provider-hub-host/mcp-outbound-client.ts'
import { createMcpOutboundProviderHubAdapter } from '../provider-hub-host/mcp-outbound-adapter.ts'

const tenantId = 'tenant-a'
const environmentId = 'prod'
const portableId = 'portable-a'
const serverId = 'buyer-mcp-1'

function transport(handler: (request: Record<string, any>) => unknown): McpOutboundTransport {
  return {
    async send(input) {
      assert.equal(input.serverId, serverId)
      assert.equal(input.scope.tenantId, tenantId)
      assert.equal(input.scope.environmentId, environmentId)
      assert.equal(input.scope.portableId, portableId)
      return handler(input.request as Record<string, any>)
    },
  }
}

function rpc(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function standardTransport(callResult: unknown = { content: [{ type: 'text', text: 'ok' }], isError: false }): McpOutboundTransport {
  return transport(request => {
    if (request.method === 'initialize') {
      return rpc(request.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: { name: 'demo', version: '1.0.0' },
        capabilities: { tools: {} },
      })
    }
    if (request.method === 'tools/list') {
      return rpc(request.id, {
        tools: [
          { name: 'records.read', description: 'Read records', inputSchema: { type: 'object' } },
          { name: 'records.write', description: 'Write records', inputSchema: { type: 'object' } },
          { name: 'unmapped.tool', description: 'Should stay hidden', inputSchema: { type: 'object' } },
        ],
      })
    }
    if (request.method === 'tools/call') return rpc(request.id, callResult)
    throw new Error(`unexpected method ${request.method}`)
  })
}

function client(using = standardTransport()) {
  return createMcpOutboundClient({
    serverId,
    scope: { tenantId, environmentId, portableId, actor: { userId: 'user-1' } },
    transport: using,
    maxTools: 8,
  })
}

test('outbound MCP client enforces response correlation and protocol version', async () => {
  const wrongId = client(transport(request => rpc(Number(request.id) + 1, { protocolVersion: MCP_PROTOCOL_VERSION })))
  await assert.rejects(() => wrongId.initialize(), /mcp_response_id_mismatch/)

  const wrongVersion = client(transport(request => rpc(request.id, {
    protocolVersion: '1900-01-01',
    serverInfo: { name: 'old', version: '0' },
  })))
  await assert.rejects(() => wrongVersion.initialize(), /mcp_unsupported_protocol_version/)
})

test('outbound MCP client rejects malformed and duplicate tool catalogs', async () => {
  const duplicate = client(transport(request => {
    if (request.method === 'initialize') return rpc(request.id, { protocolVersion: MCP_PROTOCOL_VERSION })
    return rpc(request.id, { tools: [
      { name: 'same', inputSchema: { type: 'object' } },
      { name: 'same', inputSchema: { type: 'object' } },
    ] })
  }))
  await assert.rejects(() => duplicate.listTools(), /mcp_duplicate_tool/)

  const missingSchema = client(transport(request => {
    if (request.method === 'initialize') return rpc(request.id, { protocolVersion: MCP_PROTOCOL_VERSION })
    return rpc(request.id, { tools: [{ name: 'unsafe' }] })
  }))
  await assert.rejects(() => missingSchema.listTools(), /mcp_tool_schema_required/)
})

test('Provider Hub outbound MCP discovery is exact-scope and deny-by-default', async () => {
  const adapter = createMcpOutboundProviderHubAdapter({
    serverId,
    tenantId,
    environmentId,
    portableId,
    client: client(),
    mapTool(tool) {
      if (tool.name === 'records.read') return {
        capabilityId: 'external.records.read',
        providerId: 'external-mcp',
        connectionId: 'buyer-mcp-connection',
        risk: 'read',
        requiresApproval: false,
        scopes: ['records.read'],
      }
      if (tool.name === 'records.write') return {
        capabilityId: 'external.records.write',
        providerId: 'external-mcp',
        connectionId: 'buyer-mcp-connection',
        risk: 'write',
        requiresApproval: true,
        scopes: ['records.write'],
      }
      return null
    },
  })

  assert.deepEqual(await adapter.discovery.discover({ tenantId: 'tenant-b', environmentId, portableId }), [])
  assert.deepEqual(await adapter.discovery.discover({ tenantId, environmentId, portableId: 'portable-b' }), [])

  const visible = await adapter.discovery.discover({ tenantId, environmentId, portableId })
  assert.deepEqual(visible.map(item => item.capabilityId), ['external.records.read', 'external.records.write'])
  assert.equal(visible.some(item => item.capabilityId === 'unmapped.tool'), false)
  assert.equal(visible.find(item => item.capabilityId === 'external.records.write')?.requiresApproval, true)
})

test('outbound MCP execution remains governed by Portable Connector Runtime approval policy', async () => {
  let remoteCalls = 0
  const remote = standardTransport({ content: [{ type: 'text', text: 'mutated' }], isError: false })
  const wrapped: McpOutboundTransport = {
    async send(input) {
      if ((input.request as any).method === 'tools/call') remoteCalls += 1
      return remote.send(input)
    },
  }
  const adapter = createMcpOutboundProviderHubAdapter({
    serverId,
    tenantId,
    environmentId,
    portableId,
    client: client(wrapped),
    mapTool(tool) {
      if (tool.name !== 'records.write') return null
      return {
        capabilityId: 'external.records.write',
        providerId: 'external-mcp',
        connectionId: 'buyer-mcp-connection',
        risk: 'write',
        requiresApproval: true,
        scopes: ['records.write'],
      }
    },
  })
  const runtime = createPortableConnectorRuntime({ discovery: adapter.discovery, execution: adapter.execution })
  const manifest = {
    portableId,
    manifestVersion: '1',
    requirements: [{ capabilityId: 'external.records.write', required: true, allowedRisk: 'write' as const }],
  }

  const blocked = await runtime.invoke({
    manifest,
    invocation: { tenantId, environmentId, portableId, capabilityId: 'external.records.write', args: { id: 1 } },
  })
  assert.equal(blocked.mode, 'approval_required')
  assert.equal(remoteCalls, 0)

  const allowed = await runtime.invoke({
    manifest,
    invocation: {
      tenantId,
      environmentId,
      portableId,
      capabilityId: 'external.records.write',
      args: { id: 1 },
      approval: { approvalId: 'approval-1', approvedBy: 'user-1', approvedAt: '2026-08-31T12:00:00.000Z' },
    },
  })
  assert.equal(allowed.ok, true)
  assert.equal(allowed.mode, 'mcp_remote_tool')
  assert.equal(remoteCalls, 1)
})

test('remote MCP tool errors remain failures', async () => {
  const adapter = createMcpOutboundProviderHubAdapter({
    serverId,
    tenantId,
    environmentId,
    portableId,
    client: client(standardTransport({ content: [{ type: 'text', text: 'provider failed' }], isError: true })),
    mapTool(tool) {
      if (tool.name !== 'records.read') return null
      return {
        capabilityId: 'external.records.read',
        providerId: 'external-mcp',
        connectionId: 'buyer-mcp-connection',
        risk: 'read',
        requiresApproval: false,
      }
    },
  })
  const runtime = createPortableConnectorRuntime({ discovery: adapter.discovery, execution: adapter.execution })
  const result = await runtime.invoke({
    manifest: {
      portableId,
      manifestVersion: '1',
      requirements: [{ capabilityId: 'external.records.read', required: true, allowedRisk: 'read' }],
    },
    invocation: { tenantId, environmentId, portableId, capabilityId: 'external.records.read', args: {} },
  })
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'mcp_remote_tool_error')
  assert.match(result.error || '', /provider failed/)
})
