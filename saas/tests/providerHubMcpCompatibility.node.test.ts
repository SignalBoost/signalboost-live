import assert from 'node:assert/strict'
import test from 'node:test'
import { createProviderHubMcpCompatibilityServer } from '../provider-hub-host/mcp-compatibility.ts'
import { createPortableCapabilityDescriptor } from '../provider-hub-core/capability-runtime.ts'
import type { GatewayHost, GovernancePolicy } from '../agent-gateway/types.ts'

const tenantId = 'tenant-a'
const environmentId = 'prod'
const portableId = 'portable-alpha'

function capability(input: {
  id: string
  risk: 'read' | 'write' | 'consequential'
  tenantId?: string
  availability?: 'available' | 'degraded' | 'unavailable'
  requiresApproval?: boolean
}) {
  return createPortableCapabilityDescriptor({
    capabilityId: input.id,
    providerId: 'demo-provider',
    connectionId: 'demo-connection',
    tenantId: input.tenantId || tenantId,
    environmentId,
    risk: input.risk,
    availability: input.availability || 'available',
    requiresApproval: input.requiresApproval ?? input.risk === 'consequential',
    scopes: ['demo.read'],
    metadata: { sourcePortable: 'source-product' },
  })
}

const policy: GovernancePolicy = {
  classifier: { classify: () => 'reversible_internal' },
  allowlist: [{ actionKind: 'tool_call', target: 'demo.records.read', rollback: 'read only' }],
  tenantId,
}

const host: GatewayHost = {
  execution: {
    async perform(request) {
      return { ok: true, result: { target: request.action.target, params: request.action.params } }
    },
  },
}

async function build() {
  return createProviderHubMcpCompatibilityServer({
    tenantId,
    environmentId,
    portableId,
    discovery: {
      async discover(scope) {
        assert.equal(scope.portableId, portableId)
        return [
          capability({ id: 'demo.records.read', risk: 'read' }),
          capability({ id: 'demo.records.write', risk: 'write' }),
          capability({ id: 'demo.money.move', risk: 'consequential' }),
          capability({ id: 'demo.unavailable.read', risk: 'read', availability: 'unavailable' }),
          capability({ id: 'demo.approval.read', risk: 'read', requiresApproval: true }),
          capability({ id: 'demo.other-tenant.read', risk: 'read', tenantId: 'tenant-b' }),
        ]
      },
    },
    policy,
    host,
    inputSchemaFor(capability) {
      if (capability.capabilityId !== 'demo.records.read') return null
      return { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false }
    },
  })
}

test('Provider Hub MCP exposes only exact-scope available read capabilities with explicit schemas', async () => {
  const server = await build()
  assert.deepEqual(server.listTools().map(tool => tool.name), ['demo.records.read'])
  assert.equal(server.portableId, portableId)
  assert.equal(server.tenantId, tenantId)
})

test('Provider Hub MCP rejects missing verified actor identity and cross-tenant callers', async () => {
  const server = await build()
  const message = { jsonrpc: '2.0', id: 1, method: 'tools/list' }

  const missingActor = await server.handle(message, { agentId: 'agent', tenantId })
  assert.equal(missingActor?.error?.code, -32600)
  assert.match(missingActor?.error?.message || '', /actor\.userId/)

  const wrongTenant = await server.handle(message, {
    agentId: 'agent',
    tenantId: 'tenant-b',
    actor: { userId: 'user-1' },
  })
  assert.equal(wrongTenant?.error?.code, -32600)
  assert.match(wrongTenant?.error?.message || '', /tenant/)
})

test('Provider Hub MCP read call still traverses Agent Gateway governance and execution', async () => {
  const server = await build()
  const response = await server.handle({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: { name: 'demo.records.read', arguments: { query: 'status' } },
  }, {
    agentId: 'portable-agent',
    tenantId,
    actor: { userId: 'user-1', roles: ['operator'] },
  })

  assert.equal(response?.error, undefined)
  const result = response?.result as any
  assert.equal(result?.isError, false)
  assert.equal(result?._governance?.verdict, 'execute')
  assert.match(result?.content?.[0]?.text || '', /demo\.records\.read/)
})
