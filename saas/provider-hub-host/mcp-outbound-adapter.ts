import {
  createPortableCapabilityDescriptor,
  type PortableCapabilityDescriptor,
  type PortableCapabilityDiscoveryPort,
} from '../provider-hub-core/capability-runtime.ts'
import type {
  PortableConnectorExecutionPort,
  PortableConnectorExecutionResult,
} from '../provider-hub-core/connector-runtime.ts'
import type { McpOutboundClient, McpRemoteTool } from './mcp-outbound-client.ts'

export const PROVIDER_HUB_MCP_OUTBOUND_ADAPTER_VERSION = 'provider-hub-mcp-outbound-adapter-v1' as const

export interface McpRemoteToolMapping {
  capabilityId: string
  providerId: string
  connectionId: string
  risk: PortableCapabilityDescriptor['risk']
  availability?: PortableCapabilityDescriptor['availability']
  requiresApproval: boolean
  scopes?: readonly string[]
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

export interface McpOutboundAdapterOptions {
  serverId: string
  tenantId: string
  environmentId: string
  portableId: string
  client: McpOutboundClient
  /**
   * Authorization/risk boundary. Returning null keeps the remote tool invisible. The remote
   * server's own description never determines SignalBoost authorization or consequence class.
   */
  mapTool(tool: McpRemoteTool): McpRemoteToolMapping | null
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`Provider Hub MCP outbound ${name} is required`)
  return normalized
}

function exactScope(options: McpOutboundAdapterOptions, input: {
  tenantId: string
  environmentId: string
  portableId?: string
}): boolean {
  return input.tenantId === options.tenantId &&
    input.environmentId === options.environmentId &&
    input.portableId === options.portableId
}

function descriptorFor(
  options: McpOutboundAdapterOptions,
  tool: McpRemoteTool,
  mapping: McpRemoteToolMapping,
): PortableCapabilityDescriptor {
  return createPortableCapabilityDescriptor({
    capabilityId: required(mapping.capabilityId, 'mapping.capabilityId'),
    providerId: required(mapping.providerId, 'mapping.providerId'),
    connectionId: required(mapping.connectionId, 'mapping.connectionId'),
    tenantId: options.tenantId,
    environmentId: options.environmentId,
    risk: mapping.risk,
    availability: mapping.availability ?? 'available',
    requiresApproval: Boolean(mapping.requiresApproval),
    scopes: mapping.scopes ?? [],
    inputSchemaId: `mcp:${options.serverId}:${tool.name}`,
    metadata: Object.freeze({
      bridge: PROVIDER_HUB_MCP_OUTBOUND_ADAPTER_VERSION,
      mcpServerId: options.serverId,
      remoteToolName: tool.name,
      ...(mapping.metadata ?? {}),
    }),
  })
}

function toolNameFromDescriptor(descriptor: PortableCapabilityDescriptor, serverId: string): string {
  if (descriptor.metadata?.bridge !== PROVIDER_HUB_MCP_OUTBOUND_ADAPTER_VERSION) {
    throw new Error('mcp_descriptor_bridge_mismatch')
  }
  if (descriptor.metadata?.mcpServerId !== serverId) throw new Error('mcp_descriptor_server_mismatch')
  return required(descriptor.metadata?.remoteToolName, 'descriptor.remoteToolName')
}

function remoteToolResultToExecutionResult(
  descriptor: PortableCapabilityDescriptor,
  remote: unknown,
): PortableConnectorExecutionResult {
  if (typeof remote !== 'object' || remote === null || Array.isArray(remote)) {
    return {
      ok: false,
      providerId: descriptor.providerId,
      capabilityId: descriptor.capabilityId,
      mode: 'mcp_invalid_tool_result',
      error: 'remote MCP tools/call result must be an object',
    }
  }

  const result = remote as Record<string, unknown>
  if (result.isError === true) {
    const text = Array.isArray(result.content)
      ? result.content.map(item => typeof item === 'object' && item !== null && typeof (item as any).text === 'string' ? (item as any).text : '').filter(Boolean).join('\n')
      : ''
    return {
      ok: false,
      providerId: descriptor.providerId,
      capabilityId: descriptor.capabilityId,
      mode: 'mcp_remote_tool_error',
      error: text || 'remote MCP tool reported an error',
    }
  }

  return {
    ok: true,
    providerId: descriptor.providerId,
    capabilityId: descriptor.capabilityId,
    data: remote,
    mode: 'mcp_remote_tool',
    provenance: Object.freeze({
      bridge: PROVIDER_HUB_MCP_OUTBOUND_ADAPTER_VERSION,
      mcpServerId: String(descriptor.metadata?.mcpServerId || ''),
      remoteToolName: String(descriptor.metadata?.remoteToolName || ''),
    }),
  }
}

/**
 * Convert an explicitly configured remote MCP server into Provider Hub discovery + execution
 * ports. No remote tool becomes visible unless mapTool() returns an exact SignalBoost mapping.
 */
export function createMcpOutboundProviderHubAdapter(options: McpOutboundAdapterOptions): {
  discovery: PortableCapabilityDiscoveryPort
  execution: PortableConnectorExecutionPort
} {
  const serverId = required(options.serverId, 'serverId')
  const tenantId = required(options.tenantId, 'tenantId')
  const environmentId = required(options.environmentId, 'environmentId')
  const portableId = required(options.portableId, 'portableId')
  const fixed = { ...options, serverId, tenantId, environmentId, portableId }

  const discovery: PortableCapabilityDiscoveryPort = Object.freeze({
    async discover(input) {
      if (!exactScope(fixed, input)) return Object.freeze([])
      const tools = await fixed.client.listTools()
      const descriptors: PortableCapabilityDescriptor[] = []
      const seen = new Set<string>()
      for (const tool of tools) {
        const mapping = fixed.mapTool(tool)
        if (!mapping) continue
        const descriptor = descriptorFor(fixed, tool, mapping)
        if (seen.has(descriptor.capabilityId)) throw new Error(`mcp_duplicate_capability_mapping:${descriptor.capabilityId}`)
        seen.add(descriptor.capabilityId)
        descriptors.push(descriptor)
      }
      return Object.freeze(descriptors)
    },
  })

  const execution: PortableConnectorExecutionPort = Object.freeze({
    async execute({ descriptor, invocation }) {
      if (descriptor.tenantId !== tenantId || descriptor.environmentId !== environmentId) {
        return {
          ok: false,
          providerId: descriptor.providerId,
          capabilityId: descriptor.capabilityId,
          mode: 'mcp_scope_mismatch',
          error: 'descriptor scope does not match configured MCP adapter',
        }
      }
      if (invocation.portableId !== portableId || invocation.capabilityId !== descriptor.capabilityId) {
        return {
          ok: false,
          providerId: descriptor.providerId,
          capabilityId: descriptor.capabilityId,
          mode: 'mcp_invocation_mismatch',
          error: 'invocation does not match configured MCP adapter',
        }
      }

      const remoteToolName = toolNameFromDescriptor(descriptor, serverId)
      try {
        const remote = await fixed.client.callTool(remoteToolName, invocation.args)
        return remoteToolResultToExecutionResult(descriptor, remote)
      } catch (error) {
        return {
          ok: false,
          providerId: descriptor.providerId,
          capabilityId: descriptor.capabilityId,
          mode: 'mcp_transport_error',
          error: error instanceof Error ? error.message : 'remote MCP call failed',
        }
      }
    },
  })

  return Object.freeze({ discovery, execution })
}
