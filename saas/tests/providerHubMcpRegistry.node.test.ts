import assert from 'node:assert/strict'
import test from 'node:test'
import { MCP_PROTOCOL_VERSION } from '../agent-gateway/mcp-server.ts'
import { createPortableConnectorRuntime } from '../provider-hub-core/connector-runtime.ts'
import {
  createInMemoryMcpConnectionRegistry,
  createMcpConnectionRegistryResolver,
  normalizeMcpConnectionRegistrySnapshot,
} from '../provider-hub-host/mcp-connection-registry.ts'
import type { McpOutboundTransport } from '../provider-hub-host/mcp-outbound-client.ts'

const tenantId = 'tenant-a'
const environmentId = 'prod'
const portableId = 'portable-a'
const serverId = 'mcp-crm'

function registry(overrides: Partial<Parameters<typeof createInMemoryMcpConnectionRegistry>[0]> = {}) {
  return createInMemoryMcpConnectionRegistry({
    servers: [{ serverId, displayName: 'CRM MCP', transportRef: 'buyer-host:crm', enabled: true }],
    assignments: [{
      assignmentId: 'assignment-1',
      serverId,
      tenantId,
      environmentId,
      portableId,
      enabled: true,
      tools: [
        {
          remoteToolName: 'contacts.read',
          capabilityId: 'crm.contacts.read',
          providerId: 'crm-mcp',
          connectionId: 'crm-primary',
          risk: 'read',
          requiresApproval: false,
          scopes: ['contacts.read'],
        },
        {
          remoteToolName: 'contacts.update',
          capabilityId: 'crm.contacts.update',
          providerId: 'crm-mcp',
          connectionId: 'crm-primary',
          risk: 'write',
          requiresApproval: true,
          scopes: ['contacts.write'],
        },
      ],
    }],
    ...overrides,
  })
}

function rpc(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function transportFactory(onToolCall?: (name: string) => void) {
  return {
    create(input: { serverId: string; transportRef: string }): McpOutboundTransport {
      assert.equal(input.serverId, serverId)
      assert.equal(input.transportRef, 'buyer-host:crm')
      return {
        async send({ request, scope }) {
          assert.equal(scope.tenantId, tenantId)
          assert.equal(scope.environmentId, environmentId)
          assert.equal(scope.portableId, portableId)
          const method = String(request.method)
          if (method === 'initialize') return rpc(request.id, { protocolVersion: MCP_PROTOCOL_VERSION })
          if (method === 'tools/list') return rpc(request.id, {
            tools: [
              { name: 'contacts.read', inputSchema: { type: 'object' } },
              { name: 'contacts.update', inputSchema: { type: 'object' } },
              { name: 'server.admin', inputSchema: { type: 'object' } },
            ],
          })
          if (method === 'tools/call') {
            const params = request.params as Record<string, unknown>
            onToolCall?.(String(params.name))
            return rpc(request.id, { content: [{ type: 'text', text: 'ok' }], isError: false })
          }
          throw new Error(`unexpected method ${method}`)
        },
      }
    },
  }
}

test('registry rejects wildcard scope, duplicate mappings, unknown servers, and credential-shaped metadata', () => {
  assert.throws(() => normalizeMcpConnectionRegistrySnapshot({
    servers: [{ serverId, displayName: 'CRM MCP', transportRef: 'buyer-host:crm', enabled: true }],
    assignments: [{ assignmentId: 'a', serverId, tenantId: '*', environmentId, portableId, enabled: true, tools: [] }],
  }), /does not allow wildcard scope/)

  assert.throws(() => normalizeMcpConnectionRegistrySnapshot({
    servers: [{ serverId, displayName: 'CRM MCP', transportRef: 'buyer-host:crm', enabled: true }],
    assignments: [{
      assignmentId: 'a', serverId, tenantId, environmentId, portableId, enabled: true,
      tools: [
        { remoteToolName: 'same', capabilityId: 'one', providerId: 'p', connectionId: 'c', risk: 'read', requiresApproval: false },
        { remoteToolName: 'same', capabilityId: 'two', providerId: 'p', connectionId: 'c', risk: 'read', requiresApproval: false },
      ],
    }],
  }), /mcp_registry_duplicate_remote_tool/)

  assert.throws(() => normalizeMcpConnectionRegistrySnapshot({
    servers: [{ serverId, displayName: 'CRM MCP', transportRef: 'buyer-host:crm', enabled: true }],
    assignments: [{ assignmentId: 'a', serverId: 'missing', tenantId, environmentId, portableId, enabled: true, tools: [] }],
  }), /mcp_registry_unknown_server/)

  assert.throws(() => normalizeMcpConnectionRegistrySnapshot({
    servers: [{ serverId, displayName: 'CRM MCP', transportRef: 'buyer-host:crm', enabled: true, metadata: { apiKey: 'never-store-this' } as any }],
    assignments: [],
  }), /mcp_registry_secret_field_rejected/)
})

test('consequential mappings cannot disable approval', () => {
  assert.throws(() => normalizeMcpConnectionRegistrySnapshot({
    servers: [{ serverId, displayName: 'CRM MCP', transportRef: 'buyer-host:crm', enabled: true }],
    assignments: [{
      assignmentId: 'a', serverId, tenantId, environmentId, portableId, enabled: true,
      tools: [{ remoteToolName: 'danger', capabilityId: 'danger', providerId: 'p', connectionId: 'c', risk: 'consequential', requiresApproval: false }],
    }],
  }), /consequential tool mappings must require approval/)
})

test('registry resolver is exact-scope and disabled-by-default', async () => {
  const resolver = createMcpConnectionRegistryResolver({ registry: registry(), transportFactory: transportFactory() })
  assert.equal(await resolver.resolve({ tenantId: 'tenant-b', environmentId, portableId, serverId }), null)
  assert.equal(await resolver.resolve({ tenantId, environmentId: 'dev', portableId, serverId }), null)
  assert.equal(await resolver.resolve({ tenantId, environmentId, portableId: 'portable-b', serverId }), null)
  assert.ok(await resolver.resolve({ tenantId, environmentId, portableId, serverId }))

  const disabledServer = createMcpConnectionRegistryResolver({
    registry: registry({ servers: [{ serverId, displayName: 'CRM MCP', transportRef: 'buyer-host:crm', enabled: false }] }),
    transportFactory: transportFactory(),
  })
  assert.equal(await disabledServer.resolve({ tenantId, environmentId, portableId, serverId }), null)

  const disabledAssignment = createMcpConnectionRegistryResolver({
    registry: registry({ assignments: [{ assignmentId: 'assignment-1', serverId, tenantId, environmentId, portableId, enabled: false, tools: [] }] }),
    transportFactory: transportFactory(),
  })
  assert.equal(await disabledAssignment.resolve({ tenantId, environmentId, portableId, serverId }), null)
})

test('registry exposes only explicitly mapped remote tools', async () => {
  const resolver = createMcpConnectionRegistryResolver({ registry: registry(), transportFactory: transportFactory() })
  const resolved = await resolver.resolve({ tenantId, environmentId, portableId, serverId })
  assert.ok(resolved)
  const visible = await resolved.adapter.discovery.discover({ tenantId, environmentId, portableId })
  assert.deepEqual(visible.map(item => item.capabilityId), ['crm.contacts.read', 'crm.contacts.update'])
  assert.equal(visible.some(item => item.metadata?.remoteToolName === 'server.admin'), false)
})

test('registry-resolved writes still require Portable Connector Runtime approval', async () => {
  const calls: string[] = []
  const resolver = createMcpConnectionRegistryResolver({ registry: registry(), transportFactory: transportFactory(name => calls.push(name)) })
  const resolved = await resolver.resolve({ tenantId, environmentId, portableId, serverId })
  assert.ok(resolved)
  const runtime = createPortableConnectorRuntime({ discovery: resolved.adapter.discovery, execution: resolved.adapter.execution })
  const manifest = {
    portableId,
    manifestVersion: '1',
    requirements: [{ capabilityId: 'crm.contacts.update', required: true, allowedRisk: 'write' as const }],
  }

  const blocked = await runtime.invoke({
    manifest,
    invocation: { tenantId, environmentId, portableId, capabilityId: 'crm.contacts.update', args: { id: '1' } },
  })
  assert.equal(blocked.mode, 'approval_required')
  assert.deepEqual(calls, [])

  const allowed = await runtime.invoke({
    manifest,
    invocation: {
      tenantId,
      environmentId,
      portableId,
      capabilityId: 'crm.contacts.update',
      args: { id: '1' },
      approval: { approvalId: 'approve-1', approvedBy: 'owner', approvedAt: '2026-08-31T15:00:00Z' },
    },
  })
  assert.equal(allowed.ok, true)
  assert.deepEqual(calls, ['contacts.update'])
})

test('listAssignments returns only enabled exact-scope assignments backed by enabled servers', async () => {
  const resolver = createMcpConnectionRegistryResolver({ registry: registry(), transportFactory: transportFactory() })
  const assignments = await resolver.listAssignments({ tenantId, environmentId, portableId })
  assert.equal(assignments.length, 1)
  assert.equal(assignments[0].assignmentId, 'assignment-1')
  assert.deepEqual(await resolver.listAssignments({ tenantId: 'tenant-b', environmentId, portableId }), [])
})
